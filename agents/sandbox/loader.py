"""Code prepended to everything that runs in the sandbox.

It loads the dataset into `df` and defines OUTPUT_DIR, so the generated code
never has to deal with file formats or paths.
"""

LOADER_CODE = '''\
import os, warnings
import numpy as np
import pandas as pd
warnings.filterwarnings("ignore")

DATASET_PATH = os.environ["DATASET_PATH"]
OUTPUT_DIR = os.environ.get("OUTPUT_DIR", "/work/outputs")


def _load_dataset(path):
    ext = os.path.splitext(path)[1].lower()
    if ext in (".csv", ".txt"):
        try:
            return pd.read_csv(path)
        except UnicodeDecodeError:
            return pd.read_csv(path, encoding="latin-1")
    if ext in (".xlsx", ".xlsm", ".xls"):
        return pd.read_excel(path)
    if ext == ".parquet":
        return pd.read_parquet(path)
    if ext == ".json":
        return pd.read_json(path)
    raise ValueError("Unsupported file type: " + ext)


df = _load_dataset(DATASET_PATH)
'''
