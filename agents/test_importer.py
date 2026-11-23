
import tempfile
from pathlib import Path
from io import BytesIO
from unittest.mock import patch

import pyarrow as pa
import pyarrow.parquet as pq

from api.store import DatasetStore
from api.dataset_importer import import_huggingface_csv


class FakeResponse(BytesIO):
    status = 200
    headers = {"Content-Length": "50"}

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()


# Simulated CSV content
CSV_CONTENT = b"product,rating\nPhone,5\nLaptop,4\n"


def create_parquet_content():
    """Create a small valid Parquet file in memory."""

    table = pa.table({
        "product": ["Phone", "Laptop"],
        "rating": [5, 4],
    })

    buffer = BytesIO()
    pq.write_table(table, buffer)

    return buffer.getvalue()


PARQUET_CONTENT = create_parquet_content()


def test_import(filename, content):
    with tempfile.TemporaryDirectory() as temp_dir:
        storage = DatasetStore(Path(temp_dir))

        fake_response = FakeResponse(content)

        with patch(
            "api.dataset_importer.urlopen",
            return_value=fake_response,
        ) as mocked_urlopen:

            result = import_huggingface_csv(
                datasets=storage,
                dataset_id="McAuley-Lab/Amazon-Reviews-2023",
                filename=filename,
                license_name="Not specified",
            )

            request = mocked_urlopen.call_args[0][0]
            print("\nDownload URL:", request.full_url)

        imported_path = storage.path(result["id"])

        assert imported_path is not None
        assert imported_path.exists()
        assert imported_path.read_bytes() == content

        print("Original filename:", result["source_filename"])
        print("Local filename:", result["filename"])
        print("File format:", result["file_format"])
        print("Stored file exists:", True)
        print("File size:", imported_path.stat().st_size)


def test_invalid_parquet():
    with tempfile.TemporaryDirectory() as temp_dir:
        storage = DatasetStore(Path(temp_dir))

        fake_response = FakeResponse(b"This is not a Parquet file")

        with patch(
            "api.dataset_importer.urlopen",
            return_value=fake_response,
        ):
            try:
                import_huggingface_csv(
                    datasets=storage,
                    dataset_id="McAuley-Lab/Amazon-Reviews-2023",
                    filename="invalid.parquet",
                )
            except ValueError:
                print("Invalid Parquet correctly rejected!")
            else:
                raise AssertionError("Invalid Parquet was accepted")


if __name__ == "__main__":

    print("\n===== TEST 1: NORMAL CSV =====")
    test_import("train.csv", CSV_CONTENT)

    print("\n===== TEST 2: NESTED CSV =====")
    test_import(
        "benchmark/0core/last_out/Books.train.csv",
        CSV_CONTENT,
    )

    print("\n===== TEST 3: NORMAL PARQUET =====")
    test_import("train.parquet", PARQUET_CONTENT)

    print("\n===== TEST 4: NESTED PARQUET =====")
    test_import(
        "data/benchmark/train.parquet",
        PARQUET_CONTENT,
    )

    print("\n===== TEST 5: INVALID PARQUET =====")
    test_invalid_parquet()

    print("\nAll importer tests passed!")
