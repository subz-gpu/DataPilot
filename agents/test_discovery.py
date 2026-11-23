
from api.dataset_discovery import (
    search_huggingface_datasets,
    get_huggingface_dataset_details,
)
from api.dataset_evaluator import rank_datasets

query = "amazon review datasets"

# 1. Search for datasets
print("\n1. Searching Hugging Face...")
results = search_huggingface_datasets(query, limit=5)

# 2. Fetch detailed metadata
print("\n2. Fetching dataset metadata...")
detailed_datasets = []

for result in results:
    try:
        details = get_huggingface_dataset_details(result["id"])
        detailed_datasets.append(details)
        print(f"Retrieved: {result['id']}")

    except RuntimeError as exc:
        print(f"Could not retrieve {result['id']}: {exc}")

# 3. Evaluate and rank datasets
print("\n3. Evaluating datasets...")
ranked_datasets = rank_datasets(detailed_datasets, query)

# 4. Display results
print("\n===== TOP 5 DATAPILOT RECOMMENDATIONS =====")

for index, dataset in enumerate(ranked_datasets[:5], start=1):
    print(f"\n{index}. {dataset['dataset_id']}")
    print(f"Score: {dataset['score']}/100")
    print(f"Relevance: {dataset['relevance_score']}/50")
    print(f"License: {dataset['license']}")
    print(f"Available files: {len(dataset['data_files'])}")
    print(f"Sample files: {dataset['data_files'][:3]}")
