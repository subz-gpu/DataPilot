
"""Dataset discovery using the Hugging Face REST API."""

import json
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError
import re
import subprocess

USER_AGENT = "DataPilot-DatasetDiscovery/1.0"


def _build_search_queries(query: str) -> list[str]:
    """Generate useful search variations from a user query."""

    original = " ".join(query.strip().split())
    normalized = original.lower()

    queries = [original]
    if any(word in normalized for word in [
    "amazon", "review", "reviews", "rating", "ratings"
]):
        queries.extend([
            "amazon reviews",
            "product reviews",
            "customer reviews",
            "reviews",
        ])

    words = normalized.split()

    # Add the most meaningful individual keywords.
    queries.extend(
        word for word in words
        if len(word) > 2
    )

    # Domain-specific query expansion.
    if any(word in normalized for word in [
        "amazon", "review", "reviews", "rating", "ratings"
    ]):
        queries.extend([
            "amazon reviews",
            "product reviews",
            "customer reviews",
            "reviews",
        ])

    if any(word in normalized for word in [
        "sales", "revenue", "business", "retail"
    ]):
        queries.extend([
            "sales data",
            "retail dataset",
            "business analytics",
        ])

    if any(word in normalized for word in [
        "movie", "movies", "film", "films"
    ]):
        queries.extend([
            "movie ratings",
            "movie reviews",
        ])

    # Remove duplicates while preserving order.
    unique_queries = []
    seen = set()

    for item in queries:
        cleaned = item.strip()
        key = cleaned.lower()

        if cleaned and key not in seen:
            seen.add(key)
            unique_queries.append(cleaned)

    return unique_queries[:6]


def search_huggingface_datasets(
    query: str,
    limit: int = 10,
) -> list[dict]:
    """Search Hugging Face using multiple related queries."""

    if not query or not query.strip():
        raise ValueError("Search query cannot be empty.")

    if not 1 <= limit <= 50:
        raise ValueError("Limit must be between 1 and 50.")

    search_queries = _build_search_queries(query)

    datasets = []
    seen_ids = set()

    for search_query in search_queries:

        params = urlencode({
            "search": search_query,
            "sort": "downloads",
            "direction": "-1",
            "limit": limit,
        })

        url = f"https://huggingface.co/api/datasets?{params}"

        request = Request(
            url,
            headers={"User-Agent": USER_AGENT},
        )

        try:
            with urlopen(request, timeout=20) as response:
                results = json.loads(
                    response.read().decode("utf-8")
                )

        except (HTTPError, URLError, TimeoutError) as exc:
            raise RuntimeError(
                f"Hugging Face search failed for "
                f"'{search_query}': {exc}"
            ) from exc

        for dataset in results:
            dataset_id = dataset.get("id")

            if not dataset_id or dataset_id in seen_ids:
                continue

            seen_ids.add(dataset_id)

            datasets.append({
                "id": dataset_id,
                "author": dataset.get("author"),
                "downloads": dataset.get("downloads") or 0,
                "likes": dataset.get("likes") or 0,
                "source": "huggingface",
                "url": (
                    f"https://huggingface.co/datasets/{dataset_id}"
                ),
            })
            
    return datasets[:limit]


def get_huggingface_dataset_details(dataset_id: str) -> dict:
    """Retrieve detailed metadata for a Hugging Face dataset."""

    if not dataset_id or not dataset_id.strip():
        raise ValueError("Dataset ID cannot be empty.")

    dataset_id = dataset_id.strip()

    url = (
        f"https://huggingface.co/api/datasets/"
        f"{dataset_id}"
    )

    request = Request(
        url,
        headers={"User-Agent": USER_AGENT},
    )

    try:
        with urlopen(request, timeout=20) as response:
            data = json.loads(
                response.read().decode("utf-8")
            )

    except (HTTPError, URLError, TimeoutError) as exc:
        raise RuntimeError(
            f"Could not retrieve dataset details: {exc}"
        ) from exc

    card_data = data.get("cardData") or {}

    return {
        "id": data.get("id"),
        "author": data.get("author"),
        "description": (
            card_data.get("description")
            or data.get("description")
            or ""
        ),
        "downloads": data.get("downloads") or 0,
        "likes": data.get("likes") or 0,
        "license": card_data.get("license", "Not specified"),
        "tags": data.get("tags", []),
        "files": [
            file.get("rfilename")
            for file in data.get("siblings", [])
            if file.get("rfilename")
        ],
        "url": (
            f"https://huggingface.co/datasets/{dataset_id}"
        ),
    }

def _run_kaggle_json(args: list[str]) -> list[dict]:
    """Run a Kaggle CLI command and parse its JSON output."""

    try:
        result = subprocess.run(
            ["kaggle", *args, "--format", "json"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=60,
            check=False,
        )
    except FileNotFoundError as exc:
        raise RuntimeError(
            "Kaggle CLI was not found. Install it in the agent environment."
        ) from exc
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError("Kaggle request timed out.") from exc

    if result.returncode != 0:
        message = result.stderr.strip() or "Unknown Kaggle CLI error."
        raise RuntimeError(f"Kaggle request failed: {message}")

    try:
        data = json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise RuntimeError("Kaggle returned invalid JSON.") from exc

    if not isinstance(data, list):
        raise RuntimeError("Unexpected response from Kaggle.")

    return data


def search_kaggle_datasets(query: str, limit: int = 10) -> list[dict]:
    """Search public Kaggle datasets."""

    query = query.strip()

    if len(query) < 2:
        raise ValueError("Search query must contain at least 2 characters.")

    if not 1 <= limit <= 50:
        raise ValueError("Dataset search limit must be between 1 and 50.")

    results = _run_kaggle_json([
        "datasets",
        "list",
        "--search",
        query,
        "--page-size",
        str(limit),
    ])

    datasets = []

    for item in results[:limit]:
        dataset_id = item.get("ref")

        if not dataset_id:
            continue

        parts = dataset_id.split("/")

        if len(parts) != 2:
            continue

        owner, slug = parts

        datasets.append({
            "id": dataset_id,
            "title": item.get("title") or slug,
            "author": owner,
            "downloads": item.get("downloadCount", 0),
            "likes": item.get("voteCount", 0),
            "source": "kaggle",
            "url": f"https://www.kaggle.com/datasets/{owner}/{slug}",
            "size_bytes": item.get("size", 0),
            "last_updated": item.get("lastUpdated"),
            "usability_rating": item.get("usabilityRating"),
        })

    return datasets


def get_kaggle_dataset_details(dataset_id: str) -> dict:
    """Retrieve the files available in a Kaggle dataset."""

    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", dataset_id):
        raise ValueError("Invalid Kaggle dataset ID.")

    files_data = _run_kaggle_json([
        "datasets",
        "files",
        dataset_id,
    ])

    files = [
        item["name"]
        for item in files_data
        if isinstance(item, dict) and item.get("name")
    ]

    owner, slug = dataset_id.split("/")

    return {
        "id": dataset_id,
        "title": slug,
        "author": owner,
        "description": "",
        "license": "Not specified",
        "tags": [],
        "files": files,
        "source": "kaggle",
        "url": f"https://www.kaggle.com/datasets/{dataset_id}",
    }

