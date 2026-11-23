
"""Evaluate and rank discovered datasets."""

import re


def tokenize(text: str) -> set[str]:
    """Convert text into normalized searchable words."""

    return set(re.findall(r"[a-z0-9]+", text.lower()))


def evaluate_dataset(dataset: dict, query: str) -> dict:
    """Calculate a suitability score for a discovered dataset."""

    score = 0
    reasons = []

    query_words = {
        word for word in tokenize(query)
        if len(word) > 2
    }

    # Include all available dataset information in relevance matching.
    dataset_text = " ".join([
        dataset.get("id") or "",
        dataset.get("author") or "",
        dataset.get("description") or "",
        " ".join(dataset.get("tags") or []),
        " ".join(dataset.get("files") or []),
    ])

    dataset_words = tokenize(dataset_text)

    # 1. Relevance: maximum 50 points
    matching_words = query_words.intersection(dataset_words)

    relevance_score = min(50, len(matching_words) * 15)

    # Give a small bonus when the complete search phrase appears.
    normalized_query = " ".join(query.lower().split())
    normalized_text = dataset_text.lower().replace("_", " ").replace("-", " ")

    if normalized_query in normalized_text and normalized_query:
        relevance_score = min(50, relevance_score + 5)
        reasons.append("Complete search phrase found")

    score += relevance_score

    if matching_words:
        reasons.append(
            f"Relevant keywords found: {', '.join(sorted(matching_words))}"
        )
    else:
        reasons.append("No strong keyword match found")

    # 2. Popularity: maximum 20 points
    downloads = dataset.get("downloads") or 0
    likes = dataset.get("likes") or 0

    if downloads >= 1000:
        popularity_score = 15
    elif downloads >= 100:
        popularity_score = 10
    elif downloads > 0:
        popularity_score = 5
    else:
        popularity_score = 0

    if likes >= 10:
        popularity_score += 5

    score += popularity_score
    reasons.append(f"Popularity based on {downloads} downloads")

    # 3. License information: maximum 15 points
    license_name = (dataset.get("license") or "").lower().strip()

    recognized_licenses = {
        "mit",
        "apache-2.0",
        "bsd-2-clause",
        "bsd-3-clause",
        "cc0-1.0",
        "cc-by-3.0",
        "cc-by-4.0",
        "odc-by",
        "odc-pddl",
    }

    if license_name in recognized_licenses:
        score += 15
        reasons.append(f"Recognized license: {license_name}")

    elif license_name == "other":
        reasons.append(
            "License marked as other; manual verification required"
        )

    elif license_name:
        reasons.append(
            f"License not recognized by evaluator: {license_name}"
        )

    else:
        reasons.append("License information is missing")

    # 4. File availability: maximum 15 points
    # 4. File availability: maximum 15 points
    # 4. File availability: maximum 15 points
    files = dataset.get("files") or []

    supported_files = [
        file for file in files
        if file.lower().endswith((".csv", ".parquet"))
    ]

    unsupported_data_files = [
        file for file in files
        if file.lower().endswith((".json", ".xlsx", ".xls"))
    ]

    if supported_files:
        score += 15
        reasons.append(
            f"Found {len(supported_files)} supported CSV/Parquet files"
        )
    elif unsupported_data_files:
        reasons.append(
            "Data files found, but their formats are not currently supported by the importer"
        )
    else:
        reasons.append("No supported data files found")
    return {
        **dataset,
        "score": score,
        "reasons": reasons,
    }
def rank_datasets(datasets: list[dict], query: str) -> list[dict]:
    """Evaluate and return datasets from best to worst."""

    evaluated = [
        evaluate_dataset(dataset, query)
        for dataset in datasets
    ]

    return sorted(
        evaluated,
        key=lambda item: item["score"],
        reverse=True,
    )
