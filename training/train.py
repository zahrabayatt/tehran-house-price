"""The real training run and everything the site reads.

Run with `python -m training.train`. Order of work, which is the point of this file:

1. Fit every candidate (features + lambda) on training rows and compare them by
   cost on the selection month. `select_candidate` is never handed held-out rows.
2. Train the winner once more, timed with time.perf_counter.
3. Only then evaluate on the held-out months, once, and compare with scikit-learn.
   Neither result feeds back into any choice.

Costs are always compared without the lambda penalty, so a large lambda is judged
on its predictions alone. The penalized cost is only what descent minimizes.

The model predicts log(price), not price (version 2). A cost on prices in billions
squares the miss in billions, so it serves expensive flats and leaves cheap ones with
large misses as a share of their price. On the log scale a miss of the same share
costs the same for every flat. Area and location enter as logs too, so the model is
a straight line on the log scale: log(price) is close to log(area) plus log(price per m2).
A prediction is turned back into billions with exp. `cost` and the candidates' costs
are in log units (what chose the model); `cost_billions` is the same after exp, to
compare with version 1. training/compare_targets.py reproduces the October comparison
that led to this change.
"""
from __future__ import annotations

import json
import math
import platform
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

from training.experiments import time_dot
from training.features import (build_matrix, feature_base, location_lookup,
                               split_by_month, zscore_apply, zscore_fit)
from training.model import compute_cost, gradient_descent
from training.prep import COORD_COLUMNS, RAW, run_clean

ROOT = Path(__file__).resolve().parent.parent
MODEL_PATH = ROOT / "model" / "model.json"
DATA_DIR = ROOT / "web" / "public" / "data"
CARD_PATH = ROOT / "docs" / "DATA_CARD.md"

UNIT = "billion toman"
TARGET = "log_price"
MODEL_VERSION = 2
SEED = 42
# The largest eigenvalue of X'X/m is 5.05 for the widest candidate, so descent is
# stable below 2 / 5.05 = 0.40. log(area) and log(area)^2 move almost together, so the
# smallest eigenvalue is tiny (0.0009 to 0.002 with both) and 4 of the 100 candidates,
# the winner among them, have not fully settled after 5,000 updates. Solved exactly
# with least squares, the same candidate still wins on October (0.046717 against
# 0.046730), and the winner's held-out cost differs from the exact one by 0.004%.
ALPHA = 0.3
ITERATIONS = 5000
# Penalty scale: lambda/m is the shrink per unit, and m is about 48,000. Below 10
# lambda would have no visible effect at all.
LAMBDAS = (0.0, 10.0, 100.0, 1000.0, 10000.0)
_REST = ("rooms", "age", "parking", "elevator", "storage")
AREA, LOC = "log(area)", "log(location)"
_FULL = (AREA, LOC) + _REST
SUBSETS = (
    # Without location, to show what the neighborhood adds.
    (AREA,),
    (AREA,) + _REST,
    # Location with some or all of the other fields.
    (LOC,),
    (LOC, AREA),
    (LOC, "age"),
    (LOC, "rooms", "age"),
    (LOC, "parking", "elevator", "storage"),
    (LOC, "age", "parking", "elevator", "storage"),
    (LOC,) + _REST,
    _FULL,
    # Leave one field out of the full set.
    tuple(f for f in _FULL if f != "rooms"),
    tuple(f for f in _FULL if f != "age"),
    tuple(f for f in _FULL if f != "parking"),
    tuple(f for f in _FULL if f != "elevator"),
    tuple(f for f in _FULL if f != "storage"),
    # Engineered squared terms, squares of the logs.
    (LOC, LOC + "^2"),
    (LOC, LOC + "^2") + _REST,
    _FULL + (AREA + "^2",),
    _FULL + (LOC + "^2",),
    _FULL + (AREA + "^2", LOC + "^2"),
)
CANDIDATES = tuple((s, lam) for s in SUBSETS for lam in LAMBDAS)

# Version 1 predicted price in billions. Its held-out result is kept for the record,
# from model.json at commit 8faa60b. Version 2 was chosen on October alone; its November
# and December numbers are a second look at months version 1 had already used.
VERSION_1 = {
    "target": "price", "trained_at": "2026-11-03",
    "features": ["area", "location", "rooms", "age", "parking", "elevator", "storage",
                 "area^2", "location^2"],
    "lambda": 100.0,
    "cost_billions": {"train": 16.0745, "selection": 17.0441, "held_out": 18.2830},
    "held_out_gap": {"median_billions": 1.1016, "median_share_of_price": 0.1557,
                     "p90_billions": 5.7411, "p90_share_of_price": 0.5852},
}

HISTORY_POINTS = 120
CONVERGED_RELATIVE = 1e-7  # cost change over the last 100 updates
LISTING_COUNT = 60
LISTING_FIELDS = {"neighborhood", "area", "rooms", "age", "asked", "model", "difference"}

CARD_BEGIN = "<!-- training results: written by training/train.py -->"
CARD_END = "<!-- end of training results -->"

FIELD_TABLE = [
    ("price_value", ("price",), "Target: asking price",
     "Converted to billions after confirming the unit"),
    ("building_size", ("area", "location"), "Area",
     "Implausible values removed, then scaled"),
    ("neighborhood_slug", ("location",), "Area × neighborhood median",
     "Median from training rows only"),
    ("rooms_count", ("rooms",), "Bedrooms", "Persian words converted to numbers"),
    ("construction_year", ("age",), "Building age",
     "Persian digits converted; age calculated"),
    ("has_parking", ("parking",), "Parking", "0 or 1"),
    ("has_elevator", ("elevator",), "Elevator", "0 or 1"),
    ("has_warehouse", ("storage",), "Storage", "0 or 1"),
]


# --- fitting ------------------------------------------------------------------

def fit_candidate(train: pd.DataFrame, features, lambda_: float, alpha: float,
                  iterations: int) -> dict:
    """Train on training rows. Scaling and the lookup never see any other row."""
    features = list(features)
    lookup, fallback = location_lookup(train)
    X = build_matrix(train, lookup, fallback, features)
    mu, sigma = zscore_fit(X)
    Z = zscore_apply(X, mu, sigma)
    y = log_price(train)
    w, b, history = gradient_descent(Z, y, np.zeros(Z.shape[1]), 0.0, alpha, iterations,
                                     lambda_)
    return {"features": features, "lambda": lambda_, "lookup": lookup, "fallback": fallback,
            "mu": mu, "sigma": sigma, "w": w, "b": b, "history": history,
            "diverged": len(history) < iterations}


# lab:log_price
def log_price(df: pd.DataFrame) -> np.ndarray:
    """What the model learns to predict: the natural log of the price in billions."""
    return np.log(df["price"].to_numpy(dtype=float))


def predict_log(fit: dict, df: pd.DataFrame) -> np.ndarray:
    X = build_matrix(df, fit["lookup"], fit["fallback"], fit["features"])
    return zscore_apply(X, fit["mu"], fit["sigma"]) @ fit["w"] + fit["b"]


def predict_fit(fit: dict, df: pd.DataFrame) -> np.ndarray:
    """Prices in billions: exp of the predicted log price."""
    return np.exp(predict_log(fit, df))


def plain_cost(fit: dict, df: pd.DataFrame) -> float:
    """Cost on log prices with no penalty, so candidates compare on predictions alone."""
    X = build_matrix(df, fit["lookup"], fit["fallback"], fit["features"])
    return compute_cost(zscore_apply(X, fit["mu"], fit["sigma"]), log_price(df),
                        fit["w"], fit["b"], 0.0)


def cost_in_billions(y, pred) -> float:
    """The version 1 cost, on prices in billions, so the two versions can be compared."""
    e = np.asarray(pred, dtype=float) - np.asarray(y, dtype=float)
    return float(e @ e / (2 * len(e)))
# endlab


def billions_cost(fit: dict, df: pd.DataFrame) -> float:
    return cost_in_billions(df["price"].to_numpy(dtype=float), predict_fit(fit, df))


def _converged(history: list[float]) -> bool:
    if len(history) < 101:
        return False
    return abs(history[-101] - history[-1]) <= CONVERGED_RELATIVE * abs(history[-1])


def select_candidate(train: pd.DataFrame, selection: pd.DataFrame, candidates,
                     alpha: float, iterations: int):
    """Fit all candidates and compare on the selection month.

    Returns (records, best_index, ...). A diverged candidate gets no cost and cannot
    win. best_index is None when all diverged. Ties go to the earlier candidate, and
    the grid lists smaller feature sets and smaller lambdas first.
    """
    records, best, best_fit, best_cost = [], None, None, math.inf
    for i, (features, lambda_) in enumerate(candidates):
        fit = fit_candidate(train, features, lambda_, alpha, iterations)
        rec = {"features": list(features), "lambda": lambda_, "diverged": fit["diverged"],
               "converged": _converged(fit["history"]), "train_cost": None,
               "selection_cost": None, "chosen": False}
        if not fit["diverged"]:
            rec["train_cost"] = plain_cost(fit, train)
            rec["selection_cost"] = plain_cost(fit, selection)
            if rec["selection_cost"] < best_cost:
                best, best_fit, best_cost = i, fit, rec["selection_cost"]
        records.append(rec)
    if best is not None:
        records[best]["chosen"] = True
    return records, best, best_fit, best_cost


# lab:evaluate_held_out
def evaluate_held_out(fit: dict, held: pd.DataFrame) -> tuple[float, dict, np.ndarray]:
    """The single look at held-out rows, after all choices are fixed."""
    pred = predict_fit(fit, held)
    return plain_cost(fit, held), plain_gap(held["price"].to_numpy(dtype=float), pred), pred
# endlab


def plain_gap(y, pred) -> dict:
    """How far off, in words anyone can read: billions and share of the price."""
    y, pred = np.asarray(y, dtype=float), np.asarray(pred, dtype=float)
    diff = np.abs(pred - y)
    share = diff / y
    return {"median_billions": float(np.median(diff)),
            "median_share_of_price": float(np.median(share)),
            "p90_billions": float(np.percentile(diff, 90)),
            "p90_share_of_price": float(np.percentile(share, 90))}


def sklearn_costs(fit: dict, train: pd.DataFrame, held: pd.DataFrame) -> dict:
    """Same features under scikit-learn, on held-out rows. For comparison only."""
    from sklearn.linear_model import LinearRegression, Ridge

    def matrix(df):
        X = build_matrix(df, fit["lookup"], fit["fallback"], fit["features"])
        return zscore_apply(X, fit["mu"], fit["sigma"])

    Z, y = matrix(train), log_price(train)
    Z_held, y_held = matrix(held), log_price(held)

    def cost(est):
        est.fit(Z, y)
        return compute_cost(Z_held, y_held, est.coef_, float(est.intercept_), 0.0)

    out = {"linear_regression": cost(LinearRegression())}
    if fit["lambda"] > 0:
        # J = (sum e^2 + lambda sum w^2) / 2m has the same minimum as Ridge(alpha=lambda).
        out["ridge"] = cost(Ridge(alpha=fit["lambda"]))
    return out


def _downsample(history: list[float]) -> tuple[list[int], list[float]]:
    """Update numbers spaced evenly on a log scale, where the curve actually moves."""
    n = len(history)
    points = np.unique(np.round(np.geomspace(1, n, HISTORY_POINTS)).astype(int))
    return points.tolist(), [history[i - 1] for i in points]


def predict_from_model(model: dict, df: pd.DataFrame) -> np.ndarray:
    """Predict from the exported JSON alone, the way the browser will."""
    X = build_matrix(df, model["location"]["lookup"], model["location"]["fallback"],
                     model["features"])
    Z = zscore_apply(X, np.array(model["scaling"]["mu"]), np.array(model["scaling"]["sigma"]))
    return np.exp(Z @ np.array(model["weights"]) + model["bias"])


def train_model(df: pd.DataFrame, candidates=CANDIDATES, alpha: float = ALPHA,
                iterations: int = ITERATIONS) -> dict:
    """Pick by selection cost, retrain the winner timed, then look at held-out once."""
    train, selection, held = split_by_month(df)

    records, best, _, _ = select_candidate(train, selection, candidates, alpha, iterations)
    if best is None:
        raise ValueError("every candidate diverged; lower alpha")
    features, lambda_ = candidates[best]

    start = time.perf_counter()
    final = fit_candidate(train, features, lambda_, alpha, iterations)
    runtime_ms = (time.perf_counter() - start) * 1000

    held_cost, gap, held_pred = evaluate_held_out(final, held)
    sk = sklearn_costs(final, train, held)

    its, hist = _downsample(final["history"])
    model = {
        "version": MODEL_VERSION,
        "target": TARGET,
        "features": final["features"],
        "weights": final["w"].tolist(),
        "bias": final["b"],
        "scaling": {"mu": final["mu"].tolist(), "sigma": final["sigma"].tolist()},
        "location": {"lookup": final["lookup"], "fallback": final["fallback"]},
        "hyperparameters": {"alpha": alpha, "lambda": lambda_, "iterations": iterations},
        "cost": {"train": plain_cost(final, train),
                 "selection": plain_cost(final, selection),
                 "held_out": held_cost},
        "cost_billions": {"train": billions_cost(final, train),
                          "selection": billions_cost(final, selection),
                          "held_out": cost_in_billions(held["price"].to_numpy(dtype=float),
                                                       held_pred)},
        "sklearn_cost": sk,
        "cost_history": hist,
        "cost_history_iterations": its,
        "held_out_gap": gap,
        "rows": {"train": len(train), "selection": len(selection), "held_out": len(held)},
        "date_range": {"start": str(df["month"].min()), "end": str(df["month"].max())},
        "unit": UNIT,
        "trained_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "runtime_ms": runtime_ms,
        "environment": {"python": platform.python_version(), "numpy": np.__version__,
                        "os": platform.platform()},
        "candidates": records,
        "previous_version": VERSION_1,
    }
    return {"model": model,
            "train": train, "selection": selection, "held_out": held,
            "held_pred": held_pred}


# --- exports ------------------------------------------------------------------

def label(slug) -> str:
    if not isinstance(slug, str) or not slug.strip():
        return "Unknown"
    return slug.replace("-", " ").replace("_", " ").title()


def pick_listings(held: pd.DataFrame, n: int = LISTING_COUNT, seed: int = SEED) -> pd.DataFrame:
    """Random rows. Takes no predictions, so the pick cannot depend on error size."""
    picks = np.random.default_rng(seed).choice(len(held), min(n, len(held)), replace=False)
    return held.iloc[np.sort(picks)]


def build_profile(df: pd.DataFrame, raw: pd.DataFrame, model: dict) -> dict:
    """Numbers for the Data page. No row-level values."""
    used = {feature_base(f) for f in model["features"]} | {"price"}
    months = [{"month": m, "rows": len(g),
               "median_price_per_m2": round(float(g["price_per_m2"].median()), 2),
               "median_price": round(float(g["price"].median()), 2)}
              for m, g in df.groupby("month")]
    nulls = [{"column": c, "share": round(float(raw[c].isna().mean()), 6)}
             for c in raw.columns if c not in ("city_slug", "cat3_slug", "price_mode")]
    shares = {n["column"]: n["share"] for n in nulls}
    lookup = model["location"]["lookup"]
    return {
        "row_counts": {"stored_raw": len(raw), "clean": len(df), **model["rows"]},
        "months": months,
        "null_shares": nulls,
        "fields": [{"src": src, "use": use, "proc": proc,
                    "in_model": bool(used & set(needs)), "null_share": shares.get(src)}
                   for src, needs, use, proc in FIELD_TABLE],
        "neighborhoods": {"total": int(df["neighborhood"].nunique()),
                          "with_own_median": len(lookup),
                          "fallback_median": round(model["location"]["fallback"], 2)},
        "shares": {"parking": round(float(df["parking"].mean()), 4),
                   "elevator": round(float(df["elevator"].mean()), 4),
                   "storage": round(float(df["storage"].mean()), 4)},
    }


def _finite(node) -> None:
    if isinstance(node, float) and not math.isfinite(node):
        raise ValueError("refusing to write a non-finite number")
    if isinstance(node, dict):
        for v in node.values():
            _finite(v)
    elif isinstance(node, (list, tuple)):
        for v in node:
            _finite(v)


def write_json(path: Path, data) -> int:
    _finite(data)
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(data, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    path.write_text(text + "\n", encoding="utf-8", newline="\n")
    return path.stat().st_size


# --- data card ----------------------------------------------------------------

def update_card(path: Path, body: str) -> None:
    """Replace the generated block, or add it at the end the first time."""
    text = path.read_text(encoding="utf-8")
    block = f"{CARD_BEGIN}\n{body}\n{CARD_END}"
    if CARD_BEGIN in text:
        head, rest = text.split(CARD_BEGIN, 1)
        text = head + block + rest.split(CARD_END, 1)[1]
    else:
        text = text.rstrip("\n") + "\n\n" + block + "\n"
    path.write_text(text, encoding="utf-8", newline="\n")


def card_body(model: dict, y_held, held_pred, baselines: dict) -> str:
    hp, cost, cb, gap, sk = (model["hyperparameters"], model["cost"], model["cost_billions"],
                             model["held_out_gap"], model["sklearn_cost"])
    v1 = model["previous_version"]
    lines = [
        "### Chosen model and held-out result (generated)",
        "",
        "Target: the natural log of the asking price in billions. An estimate is exp of the "
        "model's output, so it is always above zero.",
        "",
        f"Features: `{', '.join(model['features'])}`. Lambda {hp['lambda']:g}, "
        f"alpha {hp['alpha']:g}, {hp['iterations']:,} updates. "
        f"Rows: {model['rows']['train']:,} train, {model['rows']['selection']:,} selection, "
        f"{model['rows']['held_out']:,} held-out.",
        "",
        "| Cost, no penalty | On log prices (what chose the model) | On prices in billions, after exp (billion toman squared, halved) |",
        "|---|---|---|",
        f"| Train | {cost['train']:.4f} | {cb['train']:.4f} |",
        f"| Selection, 2024-10 | {cost['selection']:.4f} | {cb['selection']:.4f} |",
        f"| Held-out, 2024-11 and 2024-12 | {cost['held_out']:.4f} | {cb['held_out']:.4f} |",
        f"| scikit-learn LinearRegression, same features, held-out | "
        f"{sk['linear_regression']:.4f} | |",
    ]
    if "ridge" in sk:
        lines.append(f"| scikit-learn Ridge, same features and lambda, held-out | {sk['ridge']:.4f} | |")
    lines += [
        "",
        "How far off on held-out listings, with version 1 and simpler rules for comparison. "
        "Version 2 was chosen on October alone. Version 1 had already been scored on these "
        "months, so the version 2 row is a second look at them. None of the other rows fed "
        "into any choice.",
        "",
        "| Predictor | Cost in billions | Median gap (billions) | Median gap (share of price) | 90th percentile gap (billions) | 90th percentile gap (share) |",
        "|---|---|---|---|---|---|",
    ]
    rows = [("This model (version 2, log price)", {"cost": cb["held_out"], **gap}),
            (f"Version 1 (price in billions, trained {v1['trained_at']})",
             {"cost": v1["cost_billions"]["held_out"], **v1["held_out_gap"]})]
    rows += list(baselines.items())
    for name, g in rows:
        lines.append(f"| {name} | {g['cost']:.4f} | {g['median_billions']:.2f} | {g['median_share_of_price']:.1%} | "
                     f"{g['p90_billions']:.2f} | {g['p90_share_of_price']:.1%} |")
    lines += ["", "Gap by asked price on held-out listings:", "",
              "| Asked price (billions) | Listings | Median gap (billions) | Median gap (share) | Median signed difference, model minus asked (billions) |",
              "|---|---|---|---|---|"]
    y, p = np.asarray(y_held), np.asarray(held_pred)
    edges = [0, 3, 6, 12, 25, np.inf]
    for lo, hi in zip(edges, edges[1:]):
        m = (y >= lo) & (y < hi)
        g = plain_gap(y[m], p[m])
        name = f"{lo} to {hi}" if math.isfinite(hi) else f"{lo} and up"
        lines.append(f"| {name} | {int(m.sum()):,} | {g['median_billions']:.2f} | "
                     f"{g['median_share_of_price']:.1%} | {float(np.median(p[m] - y[m])):+.2f} |")
    lines += ["", "### All candidates tried (generated)", "",
              f"Every candidate used alpha {hp['alpha']:g} and {hp['iterations']:,} updates. "
              "Sorted by selection cost on log prices, the only thing that decided the choice. "
              "\"Settled\" means the cost moved by under one part in ten million over the last 100 updates.",
              "", "| Features | Lambda | Selection cost (log) | Train cost (log) | Settled | Chosen |",
              "|---|---|---|---|---|---|"]
    ok = sorted((c for c in model["candidates"] if c["selection_cost"] is not None),
                key=lambda c: c["selection_cost"])
    bad = [c for c in model["candidates"] if c["selection_cost"] is None]
    for c in ok:
        lines.append(f"| {', '.join(c['features'])} | {c['lambda']:g} | {c['selection_cost']:.5f} | "
                     f"{c['train_cost']:.5f} | {'yes' if c['converged'] else 'no'} | "
                     f"{'**yes**' if c['chosen'] else ''} |")
    for c in bad:
        lines.append(f"| {', '.join(c['features'])} | {c['lambda']:g} | diverged | diverged | no | |")
    return "\n".join(lines)


def _baselines(train: pd.DataFrame, held: pd.DataFrame) -> dict:
    """Simple rules, computed after the held-out look. For the card only."""
    y = held["price"].to_numpy(dtype=float)
    lookup, fallback = location_lookup(train)
    area = held["area"].to_numpy(dtype=float)
    rules = {
        "Always the training median price": np.full(len(y), train["price"].median()),
        "Area × Tehran median per m²": area * fallback / 1000,
        "Area × neighborhood median per m²": build_matrix(held, lookup, fallback, ["location"])[:, 0],
    }
    return {name: {"cost": float(np.mean((p - y) ** 2) / 2), **plain_gap(y, p)}
            for name, p in rules.items()}


def main() -> None:
    frame, steps = run_clean(coords=True)
    raw = pd.read_parquet(RAW / "tehran_apartment_sell.parquet")
    months = sorted(frame["month"].unique())
    assert months[0] == "2024-05" and months[-1] == "2024-12", months

    # Coordinates stay out of training: only site_data uses them, to place ads in neighborhoods.
    df = frame.drop(columns=COORD_COLUMNS)

    result = train_model(df)
    model, train, held = result["model"], result["train"], result["held_out"]
    model["vectorization"] = time_dot()

    sizes = {
        "model/model.json": write_json(MODEL_PATH, model),
        "funnel.json": write_json(DATA_DIR / "funnel.json", steps),
        "profile.json": write_json(DATA_DIR / "profile.json", build_profile(df, raw, model)),
    }
    from training.site_data import write_all  # site_data imports this module
    sizes.update(write_all(frame, raw, model))
    update_card(CARD_PATH, card_body(model, held["price"].to_numpy(dtype=float),
                                     result["held_pred"], _baselines(train, held)))

    print("chosen:", model["features"], "lambda", model["hyperparameters"]["lambda"])
    print("cost:", model["cost"], "sklearn:", model["sklearn_cost"])
    print("gap:", model["held_out_gap"])
    print("runtime_ms:", model["runtime_ms"])
    print("sizes:", sizes, "total", sum(sizes.values()))


if __name__ == "__main__":
    sys.exit(main())
