"""Cleaning funnel for the Tehran apartment asking-price data.

`clean` turns the raw Divar frame into the modelling frame and reports how many
rows survive each step. Bounds and the reasoning behind them are in
docs/DATA_CARD.md.

Units: `price_value` is in toman (see docs/DATA_PROFILE.md). Output `price` is
in billions of toman and `price_per_m2` in millions of toman per m2. The
`low` / `high` arguments of `clean` are bounds on `price_per_m2` in that unit.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from training.parsing import parse_rooms, parse_year  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"

# Training window (controller ruling): the 8 months that each hold 9,000+ rows.
WINDOW_START, WINDOW_END = "2024-05", "2024-12"
# Latest construction year in the data, Solar Hijri. age = LATEST_YEAR - year.
LATEST_YEAR = 1403
# Highest room label is "five or more", parsed as 5.
MAX_ROOMS = 5
# Inclusive bounds. Evidence in docs/DATA_CARD.md.
PPM2_LOW, PPM2_HIGH = 12.0, 600.0      # million toman per m2
AREA_LOW, AREA_HIGH = 25.0, 600.0      # m2

TOMAN_PER_BILLION = 1e9
TOMAN_PER_MILLION = 1e6

OUTPUT_COLUMNS = ["area", "rooms", "age", "parking", "elevator", "storage",
                  "neighborhood", "month", "price", "price_per_m2"]
COORD_COLUMNS = ["lat", "lon"]
# Raw columns that identify a row for duplicate detection (when present).
_DEDUP_COLUMNS = ["city_slug", "cat3_slug", "price_mode", "price_value",
                  "building_size", "rooms_count", "construction_year",
                  "has_parking", "has_elevator", "has_warehouse",
                  "neighborhood_slug", "created_at_month",
                  "location_latitude", "location_longitude"]
_FLAGS = [("has_parking", "parking"), ("has_elevator", "elevator"),
          ("has_warehouse", "storage")]


def _flag(v):
    """True/False (or 'true'/'false') to 1.0/0.0; anything else to NaN."""
    if isinstance(v, (bool, np.bool_)):
        return 1.0 if v else 0.0
    if isinstance(v, str):
        t = v.strip().lower()
        if t == "true":
            return 1.0
        if t == "false":
            return 0.0
    return np.nan


def _month(series: pd.Series) -> pd.Series:
    return pd.to_datetime(series, errors="coerce").dt.strftime("%Y-%m")


def _neighborhood(series: pd.Series) -> pd.Series:
    """Blank or missing slugs become None; the row is kept."""
    s = series.astype(object)
    blank = s.isna() | (s.astype(str).str.strip() == "")
    return s.where(~blank, None)


def _funnel(df: pd.DataFrame, low: float, high: float,
            area_low: float, area_high: float):
    """Run the funnel. Returns (frame with lat/lon, steps)."""
    steps: list[dict] = []

    def record(label: str, frame: pd.DataFrame) -> None:
        rows = len(frame)
        removed = 0 if not steps else steps[-1]["rows"] - rows
        steps.append({"label": label, "rows": rows, "removed": removed})

    d = df.copy()
    record("Fixed-price apartment ads (stored raw rows)", d)

    d["month"] = _month(d["created_at_month"])
    d = d[(d["month"] >= WINDOW_START) & (d["month"] <= WINDOW_END)]
    record(f"Created {WINDOW_START} to {WINDOW_END}", d)

    key = [c for c in _DEDUP_COLUMNS if c in d.columns]
    d = d.drop_duplicates(subset=key)
    record("Exact duplicate rows removed", d)

    d = d.assign(
        rooms=d["rooms_count"].map(parse_rooms),
        year=d["construction_year"].map(parse_year),
        area=pd.to_numeric(d["building_size"], errors="coerce"),
        raw_price=pd.to_numeric(d["price_value"], errors="coerce"),
    )
    for raw, name in _FLAGS:
        d[name] = d[raw].map(_flag)

    d = d[d["raw_price"].notna() & (d["raw_price"] > 0)]
    record("Price missing or not positive", d)
    d = d[d["area"].notna()]
    record("Area missing", d)
    d = d[d["rooms"].notna() & d["rooms"].between(0, MAX_ROOMS)]
    record("Rooms missing or unparseable", d)
    d = d[d["year"].notna() & (d["year"] <= LATEST_YEAR)]
    record(f"Construction year missing, unparseable or after {LATEST_YEAR}", d)
    d = d[d[[name for _, name in _FLAGS]].notna().all(axis=1)]
    record("Parking, elevator or storage flag missing", d)

    # lab:clean_bounds
    d = d[d["area"].between(area_low, area_high)]
    record(f"Area outside {area_low:g} to {area_high:g} m2", d)

    ppm2 = d["raw_price"] / d["area"] / TOMAN_PER_MILLION
    d = d[ppm2.between(low, high)]
    record(f"Price per m2 outside {low:g} to {high:g} million toman", d)
    # endlab

    out = pd.DataFrame({
        "area": d["area"].astype(float),
        "rooms": d["rooms"].astype(int),
        "age": (LATEST_YEAR - d["year"]).astype(int),
        "parking": d["parking"].astype(int),
        "elevator": d["elevator"].astype(int),
        "storage": d["storage"].astype(int),
        "neighborhood": _neighborhood(d["neighborhood_slug"]),
        "month": d["month"],
        "price": d["raw_price"] / TOMAN_PER_BILLION,
        "price_per_m2": d["raw_price"] / d["area"] / TOMAN_PER_MILLION,
    })
    for src, dst in (("location_latitude", "lat"), ("location_longitude", "lon")):
        out[dst] = d[src].astype(float) if src in d.columns else np.nan
    return out.reset_index(drop=True), steps


def clean(df: pd.DataFrame, low: float, high: float, *,
          area_low: float = AREA_LOW, area_high: float = AREA_HIGH):
    """Return (modelling frame, steps). `low`/`high` bound price_per_m2 (million toman).

    The frame has exactly OUTPUT_COLUMNS: no titles, descriptions or coordinates.
    Each step is {"label", "rows", "removed"}; "rows" is the count after the step.
    """
    out, steps = _funnel(df, low, high, area_low, area_high)
    return out[OUTPUT_COLUMNS], steps


def clean_with_coords(df: pd.DataFrame, low: float, high: float, *,
                      area_low: float = AREA_LOW, area_high: float = AREA_HIGH):
    """Same rows and steps as `clean`, plus `lat` and `lon` (NaN when absent).

    For building hexagon features only; never ship this frame.
    """
    out, steps = _funnel(df, low, high, area_low, area_high)
    return out[OUTPUT_COLUMNS + COORD_COLUMNS], steps


def prior_steps() -> list[dict]:
    """Funnel counts from the download step, read from data/raw/funnel.json."""
    f = json.loads((RAW / "funnel.json").read_text(encoding="utf-8"))
    rows = [("All ads in dataset", f["total_rows"]),
            ("Tehran (city_slug = tehran)", f["tehran_rows"]),
            ("Apartment sale (cat3_slug = apartment-sell)",
             f["tehran_apartment_sell_rows"])]
    steps, prev = [], None
    for label, n in rows:
        steps.append({"label": label, "rows": n,
                      "removed": 0 if prev is None else prev - n})
        prev = n
    return steps


def run_clean(coords: bool = False):
    """Load raw data and clean it with the chosen bounds.

    Returns (frame, steps). The steps start with all 1,000,000 ads, then Tehran,
    then apartment sale, then the fixed-price rows stored in data/raw/.
    """
    raw = pd.read_parquet(RAW / "tehran_apartment_sell.parquet")
    prior = prior_steps()
    fn = clean_with_coords if coords else clean
    out, steps = fn(raw, PPM2_LOW, PPM2_HIGH)
    fixed = json.loads((RAW / "funnel.json").read_text(encoding="utf-8"))[
        "tehran_apartment_sell_fixed_price_rows"]
    assert steps[0]["rows"] == fixed == len(raw), "raw file does not match funnel.json"
    steps[0]["removed"] = prior[-1]["rows"] - steps[0]["rows"]
    return out, prior + steps


def main() -> None:
    out, steps = run_clean()
    for s in steps:
        print(f"{s['rows']:>10,}  {-s['removed']:>9,}  {s['label']}")
    print(f"\nfinal frame: {out.shape[0]:,} rows x {out.shape[1]} columns")


if __name__ == "__main__":
    main()
