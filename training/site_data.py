"""Everything the site reads besides the model itself, built from the cleaned ads and model.json.

Run with `python -m training.site_data` (training.train also runs it at the end). It never
retrains: it reads model/model.json and writes into web/public/data:

- neighborhoods.geojson: official neighborhoods with their ad count, median price per m2 and
  the Divar neighborhood the model is given for them (training/neighborhoods.py).
- similar.json: area and price of the November and December ads in each neighborhood, which
  the Estimate page turns into one "similar ads then" range.
- listings.json: a seeded random pick of held-out ads with the model's estimate (Data page).
- lab-train.json, lab-clean.json, lab-october.json, lab-heldout.json: the Model Lab's data.

Only area, price and the model's other inputs leave this module. No coordinates, titles,
descriptions or user fields are written.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

from training import neighborhoods as nb
from training.features import location_feature, split_by_month
from training.prep import COORD_COLUMNS, RAW, _funnel
from training.train import (DATA_DIR, LISTING_COUNT, MODEL_PATH, SEED, label, pick_listings,
                            plain_gap, predict_from_model, write_json)


def _col(values, digits: int) -> list:
    return [round(float(v), digits) for v in values]


def build_listings(held: pd.DataFrame, pred: np.ndarray, names: dict[str, str],
                   n: int = LISTING_COUNT, seed: int = SEED) -> list[dict]:
    """Held-out ads picked at random (the pick never sees an estimate), with official names."""
    pred = pd.Series(pred, index=held.index)
    rows = []
    for idx, r in pick_listings(held, n, seed).iterrows():
        asked, model = round(float(r["price"]), 2), round(float(pred[idx]), 2)
        slug = r["neighborhood"]
        rows.append({"neighborhood": names.get(slug, label(slug)),
                     "area": round(float(r["area"]), 1), "rooms": int(r["rooms"]),
                     "age": int(r["age"]), "asked": asked, "model": model,
                     "difference": round(model - asked, 2)})
    return rows


def same_size_examples(train: pd.DataFrame, lookup: dict[str, float], names: dict[str, str]) -> list[dict]:
    """Three real training ads of about 85 m2 in a cheap, a middle and a dear neighborhood (Lab step 11)."""
    t = train[(train["area"] >= 84) & (train["area"] <= 86)
              & train["neighborhood"].isin([k for k in lookup if k in names])]
    med = t["neighborhood"].map(lookup)
    loc = location_feature(t, lookup, 0.0)
    loc = pd.Series(loc, index=t.index)
    out = []
    for q in (0.05, 0.5, 0.97):
        i = (med - med.quantile(q)).abs().idxmin()
        r = t.loc[i]
        out.append({"hood": names[r["neighborhood"]], "area": float(r["area"]),
                    "ppm2": round(lookup[r["neighborhood"]], 1),
                    "loc": round(float(loc[i]), 2), "price": round(float(r["price"]), 2)})
    return out


def lab_train(train: pd.DataFrame, lookup: dict[str, float], fallback: float, names: dict[str, str]) -> dict:
    loc = location_feature(train, lookup, fallback)
    return {
        "rows": len(train),
        "area": _col(train["area"], 1), "rooms": [int(v) for v in train["rooms"]],
        "age": [int(v) for v in train["age"]], "parking": [int(v) for v in train["parking"]],
        "location": _col(loc, 2), "price": _col(train["price"], 2),
        "fallback": round(fallback, 1), "hoods": len(lookup),
        "examples": same_size_examples(train, lookup, names),
    }


def lab_clean(raw: pd.DataFrame) -> dict:
    """Every stored ad that reaches the area and price-per-m2 limits, before those limits apply."""
    d, _ = _funnel(raw, 0.0, float("inf"), 0.0, float("inf"))
    return {"area": _col(d["area"], 1), "ppm2": [float(f"{v:.4g}") for v in d["price_per_m2"]]}


def lab_heldout(held: pd.DataFrame, pred: np.ndarray, names: dict[str, str], model: dict) -> dict:
    slugs = sorted({s for s in held["neighborhood"] if isinstance(s, str)})
    index = {s: i for i, s in enumerate(slugs)}
    return {
        "months": sorted(held["month"].unique().tolist()),
        "hoods": [names.get(s, label(s)) for s in slugs],
        "estimate": _col(pred, 2), "asked": _col(held["price"], 2),
        "area": _col(held["area"], 1), "rooms": [int(v) for v in held["rooms"]],
        "hood": [index.get(s, -1) for s in held["neighborhood"]],
        "target": model["target"],
        "cost": {k: round(v, 5) for k, v in model["cost"].items()},
        "costBillions": {k: round(v, 3) for k, v in model["cost_billions"].items()},
        "sklearn": {k: round(v, 5) for k, v in model["sklearn_cost"].items()},
        "previous": {"costBillions": model["previous_version"]["cost_billions"],
                     "gap": model["previous_version"]["held_out_gap"]},
        "gap": model["held_out_gap"], "rowCounts": model["rows"],
        "lambda": model["hyperparameters"]["lambda"],
        "lambdaTried": sorted({c["lambda"] for c in model["candidates"]}),
    }


def data_summary(held: pd.DataFrame, feature_map: dict, model: dict) -> dict:
    """Small numbers for the Data page: the model's typical miss, the simple rule and version 1
    it is compared with, and map counts."""
    lookup, fallback = model["location"]["lookup"], model["location"]["fallback"]
    y = held["price"].to_numpy(dtype=float)
    rule = location_feature(held, lookup, fallback)   # area x neighborhood median per m2, no training
    priced = [f for f in feature_map["features"] if "ppm2" in f["properties"]]
    return {"gap": model["held_out_gap"], "heldOut": model["rows"]["held_out"],
            "simpleRule": {k: round(float(v), 4) for k, v in plain_gap(y, rule).items()},
            "previousGap": model["previous_version"]["held_out_gap"],
            "neighborhoodsWithPrice": len(priced), "neighborhoods": len(feature_map["features"])}


def write_all(frame: pd.DataFrame, raw: pd.DataFrame, model: dict) -> dict[str, int]:
    """Write every site data file. `frame` is the cleaned ads with lat and lon."""
    boundaries = nb.load_boundaries()
    feature_map = nb.build_map(frame, boundaries)
    names = nb.official_names(feature_map)
    train_c, selection_c, held_c = split_by_month(frame)
    similar = nb.similar_ads(frame, boundaries, sorted(held_c["month"].unique().tolist()))
    # Coordinates end here. Nothing below can see them.
    train, selection, held = (d.drop(columns=COORD_COLUMNS) for d in (train_c, selection_c, held_c))
    lookup, fallback = model["location"]["lookup"], model["location"]["fallback"]
    pred = predict_from_model(model, held)
    heldout = lab_heldout(held, pred, names, model)
    heldout["monthMedians"] = {m: round(float(g["price_per_m2"].median()), 1)
                               for m, g in frame.groupby("month")}
    return {
        "neighborhoods.geojson": write_json(DATA_DIR / "neighborhoods.geojson", feature_map),
        "similar.json": write_json(DATA_DIR / "similar.json", similar),
        "listings.json": write_json(DATA_DIR / "listings.json", build_listings(held, pred, names)),
        "data-summary.json": write_json(DATA_DIR / "data-summary.json",
                                        data_summary(held, feature_map, model)),
        "lab-train.json": write_json(DATA_DIR / "lab-train.json", lab_train(train, lookup, fallback, names)),
        "lab-clean.json": write_json(DATA_DIR / "lab-clean.json", lab_clean(raw)),
        "lab-october.json": write_json(DATA_DIR / "lab-october.json",
                                       {"month": str(selection["month"].iloc[0]),
                                        "area": _col(selection["area"], 1),
                                        "price": _col(selection["price"], 2)}),
        "lab-heldout.json": write_json(DATA_DIR / "lab-heldout.json", heldout),
    }


def main() -> int:
    from training.prep import run_clean
    frame, _ = run_clean(coords=True)
    raw = pd.read_parquet(RAW / "tehran_apartment_sell.parquet")
    model = json.loads(MODEL_PATH.read_text(encoding="utf-8"))
    sizes = write_all(frame, raw, model)
    for name, size in sizes.items():
        print(f"{name}: {size:,} bytes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
