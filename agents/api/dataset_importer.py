
"""Safely download and import Hugging Face CSV and Parquet datasets."""

import csv
import io
import shutil
from pathlib import PurePosixPath
from urllib.parse import quote
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError
import re
import subprocess
import tempfile
import zipfile
from pathlib import Path
import pyarrow.parquet as pq

from .store import DatasetStore, now_iso, safe_filename


MAX_IMPORT_BYTES = 50 * 1024 * 1024
SUPPORTED_FORMATS = {".csv", ".parquet"}

def validate_dataset_content(content: bytes, extension: str) -> None:
    """Validate CSV or Parquet content before storing it."""

    if not content:
        raise ValueError("Downloaded dataset is empty.")

    if len(content) > MAX_IMPORT_BYTES:
        raise ValueError("Dataset exceeds the 50 MB import limit.")

    if extension == ".csv":
        try:
            decoded = content.decode("utf-8-sig")
            reader = csv.reader(io.StringIO(decoded), strict=True)
            header = next(reader, None)

            if not header or not any(column.strip() for column in header):
                raise ValueError("CSV does not contain a valid header.")

            for _ in reader:
                pass

        except UnicodeDecodeError as exc:
            raise ValueError("The downloaded CSV is not valid UTF-8.") from exc
        except csv.Error as exc:
            raise ValueError(f"Invalid CSV structure: {exc}") from exc

    elif extension == ".parquet":
        try:
            parquet_file = pq.ParquetFile(io.BytesIO(content))

            if parquet_file.metadata.num_columns == 0:
                raise ValueError("Parquet file contains no columns.")

            if parquet_file.metadata.num_rows == 0:
                raise ValueError("Parquet file contains no rows.")

        except (OSError, ValueError) as exc:
            raise ValueError(f"Invalid Parquet file: {exc}") from exc



def import_huggingface_csv(
    datasets: DatasetStore,
    dataset_id: str,
    filename: str,
    license_name: str = "Not specified",
) -> dict:
    """Download and import a Hugging Face CSV or Parquet file."""

    if not dataset_id or not filename:
        raise ValueError("Dataset ID and filename are required.")

    # Validate the original Hugging Face repository path.
    if "\\" in filename:
        raise ValueError("Invalid dataset file path.")

    source_path = PurePosixPath(filename)
    extension = source_path.suffix.lower()

    if (
        source_path.is_absolute()
        or any(part in ("", ".", "..") for part in source_path.parts)
        or extension not in SUPPORTED_FORMATS
    ):
        raise ValueError("Only valid CSV and Parquet file paths are allowed.")

    # Preserve the complete source path in the download URL.
    encoded_id = quote(dataset_id, safe="/")
    encoded_filename = quote(filename, safe="/")

    url = (
        f"https://huggingface.co/datasets/"
        f"{encoded_id}/resolve/main/{encoded_filename}"
    )

    request = Request(
        url,
        headers={"User-Agent": "DataPilot-DatasetImporter/1.0"},
    )

    try:
        with urlopen(request, timeout=30) as response:
            if response.status != 200:
                raise ValueError("Dataset download failed.")

            content_length = response.headers.get("Content-Length")

            if content_length and int(content_length) > MAX_IMPORT_BYTES:
                raise ValueError("Dataset exceeds the 50 MB import limit.")

            content = response.read(MAX_IMPORT_BYTES + 1)

    except (HTTPError, URLError, TimeoutError) as exc:
        raise RuntimeError(f"Dataset download failed: {exc}") from exc

    if not content:
        raise ValueError("Downloaded dataset is empty.")

    if len(content) > MAX_IMPORT_BYTES:
        raise ValueError("Dataset exceeds the 50 MB import limit.")

    # Validate the downloaded file according to its format.
    validate_dataset_content(content, extension)

    # Create a safe local filename while retaining the original path.
    local_name = safe_filename(filename)

    internal_id, file_path = datasets.create(local_name)

    try:
        file_path.write_bytes(content)

        meta = {
            "id": internal_id,
            "filename": local_name,
            "source_filename": filename,
            "stored_name": file_path.name,
            "file_format": extension.lstrip("."),
            "size_bytes": len(content),
            "uploaded_at": now_iso(),
            "source": "huggingface",
            "source_dataset_id": dataset_id,
            "license": license_name,
        }

        datasets.save_meta(internal_id, meta)
        return meta

    except Exception:
        shutil.rmtree(datasets.dir(internal_id), ignore_errors=True)
        raise

def import_kaggle_dataset(
    datasets: DatasetStore,
    dataset_id: str,
    filename: str,
    license_name: str = "Not specified",
) -> dict:
    """Download and import a selected Kaggle CSV or Parquet file."""

    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", dataset_id):
        raise ValueError("Invalid Kaggle dataset ID.")

    if not filename or "\\" in filename:
        raise ValueError("Invalid dataset file path.")

    source_path = PurePosixPath(filename)
    extension = source_path.suffix.lower()

    if (
        source_path.is_absolute()
        or any(part in ("", ".", "..") for part in source_path.parts)
        or extension not in SUPPORTED_FORMATS
    ):
        raise ValueError("Only valid CSV and Parquet files are allowed.")

    try:
        with tempfile.TemporaryDirectory(prefix="datapilot-kaggle-") as temp:
            temp_dir = Path(temp)

            result = subprocess.run(
                [
                    "kaggle",
                    "datasets",
                    "download",
                    dataset_id,
                    "-f",
                    filename,
                    "-p",
                    str(temp_dir),
                    "-q",
                ],
                capture_output=True,
                text=True,
                timeout=120,
                check=False,
            )

            if result.returncode != 0:
                message = result.stderr.strip() or "Unknown Kaggle CLI error."
                raise RuntimeError(f"Kaggle download failed: {message}")

            downloaded_files = [
                path for path in temp_dir.rglob("*")
                if path.is_file()
            ]

            if len(downloaded_files) != 1:
                raise ValueError(
                    "Kaggle did not return exactly one selected file."
                )

            downloaded = downloaded_files[0]

            # Support ZIP responses as well as direct file downloads.
            if zipfile.is_zipfile(downloaded):
                if downloaded.stat().st_size > MAX_IMPORT_BYTES:
                    raise ValueError("Dataset archive exceeds the 50 MB limit.")

                with zipfile.ZipFile(downloaded) as archive:
                    matches = [
                        info for info in archive.infolist()
                        if not info.is_dir()
                        and info.filename == filename
                    ]

                    if len(matches) != 1:
                        raise ValueError(
                            "Selected file was not found in the Kaggle archive."
                        )

                    info = matches[0]

                    member_path = PurePosixPath(info.filename)

                    if (
                        member_path.is_absolute()
                        or "\\" in info.filename
                        or any(part in ("", ".", "..") for part in member_path.parts)
                    ):
                        raise ValueError("Unsafe file path in Kaggle archive.")

                    if info.file_size > MAX_IMPORT_BYTES:
                        raise ValueError("Dataset exceeds the 50 MB import limit.")

                    with archive.open(info) as member:
                        content = member.read(MAX_IMPORT_BYTES + 1)

            else:
                if downloaded.stat().st_size > MAX_IMPORT_BYTES:
                    raise ValueError("Dataset exceeds the 50 MB import limit.")

                content = downloaded.read_bytes()

    except subprocess.TimeoutExpired as exc:
        raise RuntimeError("Kaggle download timed out.") from exc

    validate_dataset_content(content, extension)

    local_name = safe_filename(filename)
    internal_id, file_path = datasets.create(local_name)

    try:
        file_path.write_bytes(content)

        meta = {
            "id": internal_id,
            "filename": local_name,
            "source_filename": filename,
            "stored_name": file_path.name,
            "file_format": extension.lstrip("."),
            "size_bytes": len(content),
            "uploaded_at": now_iso(),
            "source": "kaggle",
            "source_dataset_id": dataset_id,
            "license": license_name,
        }

        datasets.save_meta(internal_id, meta)
        return meta

    except Exception:
        shutil.rmtree(datasets.dir(internal_id), ignore_errors=True)
        raise

