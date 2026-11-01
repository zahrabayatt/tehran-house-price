"""Download the Divar real-estate dataset at a pinned revision and keep only
the Tehran apartment-sale subset, with only the columns this project uses.

The Parquet conversion that Hugging Face publishes for the dataset is read
file by file, row group by row group. Title, description, and user fields are
never selected, so they are never held in memory or written to disk.

Output (git-ignored):
    data/raw/tehran_apartment_sell.parquet   filtered subset
    data/raw/funnel.json                     row counts at each filter step
    data/raw/SOURCE.json                     dataset id, pinned revisions, URLs
"""
from __future__ import annotations

import json
import shutil
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.parquet as pq

DATASET = "divarofficial/real_estate_ads"
# `sha` of https://huggingface.co/api/datasets/divarofficial/real_estate_ads
DATASET_REVISION = "e9446ee97b8e6eb9bd62bdfd7548f1bc8973be85"
# Head of refs/convert/parquet, from
# https://huggingface.co/api/datasets/divarofficial/real_estate_ads/revision/refs%2Fconvert%2Fparquet
PARQUET_REVISION = "e6e201dd5e4ea21cbd615746748c155f4628ed7b"
PARQUET_FILES = ["default/train/0000.parquet", "default/train/0001.parquet"]

CITY = "tehran"
CATEGORY = "apartment-sell"
PRICE_MODE = "مقطوع"

COLUMNS = [
    "city_slug",
    "cat3_slug",
    "price_mode",
    "price_value",
    "building_size",
    "rooms_count",
    "construction_year",
    "has_parking",
    "has_elevator",
    "has_warehouse",
    "neighborhood_slug",
    "created_at_month",
    "location_latitude",
    "location_longitude",
]

RAW_DIR = Path(__file__).resolve().parent.parent / "data" / "raw"
OUTPUT = RAW_DIR / "tehran_apartment_sell.parquet"


def parquet_url(path: str) -> str:
    return f"https://huggingface.co/datasets/{DATASET}/resolve/{PARQUET_REVISION}/{path}"


def fetch(url: str, dest: Path, attempts: int = 8) -> None:
    """Stream `url` to `dest`, resuming with Range requests after a failure."""
    for attempt in range(attempts):
        have = dest.stat().st_size if dest.exists() else 0
        request = urllib.request.Request(url, headers={"Range": f"bytes={have}-"} if have else {})
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                total = have + int(response.headers.get("Content-Length", 0))
                with open(dest, "ab" if have else "wb") as out:
                    shutil.copyfileobj(response, out, length=1 << 20)
            if dest.stat().st_size == total:
                return
        except Exception as error:  # network hiccup: retry and resume
            print(f"  retry {attempt + 1}/{attempts}: {error}", file=sys.stderr)
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"could not download {url}")


def filter_file(path: Path, funnel: dict, kept: list[pa.Table]) -> None:
    reader = pq.ParquetFile(path)
    missing = [c for c in COLUMNS if c not in reader.schema_arrow.names]
    if missing:
        raise KeyError(f"columns missing from {path.name}: {missing}")
    for batch in reader.iter_batches(batch_size=100_000, columns=COLUMNS):
        table = pa.Table.from_batches([batch])
        funnel["total_rows"] += table.num_rows
        tehran = table.filter(pc.equal(table["city_slug"], CITY))
        funnel["tehran_rows"] += tehran.num_rows
        apartment = tehran.filter(pc.equal(tehran["cat3_slug"], CATEGORY))
        funnel["tehran_apartment_sell_rows"] += apartment.num_rows
        fixed = apartment.filter(pc.equal(apartment["price_mode"], PRICE_MODE))
        funnel["tehran_apartment_sell_fixed_price_rows"] += fixed.num_rows
        if fixed.num_rows:
            kept.append(fixed)


def main(cache_dir: str | None = None) -> None:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    funnel = {
        "total_rows": 0,
        "tehran_rows": 0,
        "tehran_apartment_sell_rows": 0,
        "tehran_apartment_sell_fixed_price_rows": 0,
    }
    kept: list[pa.Table] = []
    work = Path(cache_dir) if cache_dir else Path(tempfile.mkdtemp(prefix="divar_parquet_"))
    work.mkdir(parents=True, exist_ok=True)
    try:
        for name in PARQUET_FILES:
            local = work / Path(name).name
            print(f"downloading {name}")
            fetch(parquet_url(name), local)
            print(f"filtering {name}")
            filter_file(local, funnel, kept)
    finally:
        if not cache_dir:
            shutil.rmtree(work, ignore_errors=True)
    subset = pa.concat_tables(kept)
    pq.write_table(subset, OUTPUT, compression="zstd")
    (RAW_DIR / "funnel.json").write_text(json.dumps(funnel, indent=2), encoding="utf-8")
    source = {
        "dataset": DATASET,
        "dataset_revision": DATASET_REVISION,
        "parquet_revision": PARQUET_REVISION,
        "parquet_files": [parquet_url(n) for n in PARQUET_FILES],
        "filter": {"city_slug": CITY, "cat3_slug": CATEGORY, "price_mode": PRICE_MODE},
        "columns": COLUMNS,
    }
    (RAW_DIR / "SOURCE.json").write_text(json.dumps(source, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(funnel, indent=2))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else None)
