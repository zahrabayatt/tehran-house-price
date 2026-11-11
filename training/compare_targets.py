"""Why the model predicts log(price): the October comparison behind version 2.

Run with `python -m training.compare_targets` (about 15 minutes). It never touches the
held-out months. Three approaches each train the same 100 candidates (20 feature sets
times 5 lambdas) on May to September and pick their own best candidate by October cost:

- price:      target price in billions, inputs area and location as they are (version 1)
- log_price:  target log(price), the same inputs
- log_both:   target log(price), with log(area) and log(location) (version 2, training.train)

The three winners are then compared on October, in words anyone can read: the typical
miss, the one-in-ten miss, both also as a share of the price, and the cost in billions.
The result goes to web/public/data/lab-logprice.json for the Model Lab.
"""
from __future__ import annotations

import math
import sys
import time

import numpy as np
import pandas as pd

from training.features import build_matrix, location_lookup, split_by_month, zscore_apply, zscore_fit
from training.model import gradient_descent
from training.prep import run_clean
from training.train import (ALPHA, CANDIDATES, DATA_DIR, ITERATIONS, cost_in_billions,
                            plain_gap, write_json)

APPROACHES = {
    "price": {"label": "Price", "log_target": False, "log_inputs": False},
    "log_price": {"label": "Log price", "log_target": True, "log_inputs": False},
    "log_both": {"label": "Log price and log inputs", "log_target": True, "log_inputs": True},
}


def plain_names(features) -> tuple[str, ...]:
    """The version 1 spelling of a candidate: log(area) -> area, log(location)^2 -> location^2."""
    return tuple(f.replace("log(", "").replace(")", "") for f in features)


def fit(train: pd.DataFrame, features, lambda_: float, log_target: bool) -> dict:
    lookup, fallback = location_lookup(train)
    X = build_matrix(train, lookup, fallback, features)
    mu, sigma = zscore_fit(X)
    y = train["price"].to_numpy(dtype=float)
    y = np.log(y) if log_target else y
    w, b, hist = gradient_descent(zscore_apply(X, mu, sigma), y, np.zeros(X.shape[1]), 0.0,
                                  ALPHA, ITERATIONS, lambda_)
    return {"features": list(features), "lambda": lambda_, "lookup": lookup, "fallback": fallback,
            "mu": mu, "sigma": sigma, "w": w, "b": b, "log_target": log_target,
            "diverged": len(hist) < ITERATIONS}


def predict(f: dict, df: pd.DataFrame) -> np.ndarray:
    X = build_matrix(df, f["lookup"], f["fallback"], f["features"])
    out = zscore_apply(X, f["mu"], f["sigma"]) @ f["w"] + f["b"]
    return np.exp(out) if f["log_target"] else out


def fitting_cost(f: dict, df: pd.DataFrame) -> float:
    """The cost the approach trains on (billions or log units), no penalty: what picks its winner."""
    y = df["price"].to_numpy(dtype=float)
    p = predict(f, df)
    if f["log_target"]:
        y, p = np.log(y), np.log(p)
    return cost_in_billions(y, p)


def best_candidate(train, selection, log_target: bool, log_inputs: bool) -> dict:
    best, best_cost = None, math.inf
    for features, lambda_ in CANDIDATES:
        names = tuple(features) if log_inputs else plain_names(features)
        f = fit(train, names, lambda_, log_target)
        if f["diverged"]:
            continue
        c = fitting_cost(f, selection)
        if c < best_cost:
            best, best_cost = f, c
    if best is None:
        raise ValueError("every candidate diverged")
    return best


def quarters(y: np.ndarray, pred: np.ndarray, edges: np.ndarray) -> list[dict]:
    share = np.abs(pred - y) / y
    out = []
    for lo, hi in zip(edges[:-1], edges[1:]):
        m = (y >= lo) & (y <= hi)
        out.append({"from": round(float(lo), 2), "to": round(float(hi), 2), "ads": int(m.sum()),
                    "median_share": round(float(np.median(share[m])), 6)})
    return out


def compare(df: pd.DataFrame) -> dict:
    train, selection, _ = split_by_month(df)   # the held-out months are never used here
    y = selection["price"].to_numpy(dtype=float)
    edges = np.quantile(y, [0, 0.25, 0.5, 0.75, 1.0])
    out = {"month": str(selection["month"].iloc[0]), "ads": len(selection),
           "candidates": len(CANDIDATES), "approaches": []}
    for key, a in APPROACHES.items():
        start = time.perf_counter()
        f = best_candidate(train, selection, a["log_target"], a["log_inputs"])
        pred = predict(f, selection)
        gap = plain_gap(y, pred)
        out["approaches"].append({
            "key": key, "label": a["label"], "features": f["features"], "lambda": f["lambda"],
            "cost_billions": round(cost_in_billions(y, pred), 6),
            **{k: round(v, 6) for k, v in gap.items()},
            "quarters": quarters(y, pred, edges),
        })
        print(f"{key}: {f['features']} lambda {f['lambda']:g} "
              f"({time.perf_counter() - start:.0f}s)", flush=True)
    return out


def main() -> int:
    df, _ = run_clean()
    result = compare(df)
    size = write_json(DATA_DIR / "lab-logprice.json", result)
    for a in result["approaches"]:
        print(f"{a['label']}: typical miss {a['median_share_of_price']:.1%}, "
              f"one in ten over {a['p90_share_of_price']:.1%}, cost {a['cost_billions']:.2f}")
    print(f"lab-logprice.json: {size:,} bytes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
