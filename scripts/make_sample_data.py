"""Generate a small messy sales dataset for testing (stdlib only)."""
import csv
import random
from pathlib import Path

random.seed(42)
out = Path(__file__).resolve().parent.parent / "data" / "sample"
out.mkdir(parents=True, exist_ok=True)

regions = ["North", "South", "East", "West", None]
products = ["Laptop", "Phone", "Tablet", "Monitor"]

with open(out / "sales.csv", "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["order_id", "date", "region", "product", "units", "unit_price", "discount"])
    for i in range(1, 1001):
        w.writerow([
            i,
            f"2025-{random.randint(1, 12):02d}-{random.randint(1, 28):02d}",
            random.choice(regions) or "",
            random.choice(products),
            random.choice([random.randint(1, 20), ""]) if random.random() < 0.05 else random.randint(1, 20),
            round(random.uniform(200, 1500), 2),
            random.choice([0, 0, 0.05, 0.1, ""]),
        ])
print("Wrote", out / "sales.csv")
