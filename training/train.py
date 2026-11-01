"""The real training run and everything the site reads.

Run with `python -m training.train`. Order of work, which is the point of this file:

1. Fit every candidate (features + lambda) on training rows and compare them by
   cost on the selection month. `select_candidate` is never handed held-out rows.
2. Train the winner once more, timed with time.perf_counter.
3. Only then evaluate on the held-out months, once, and compare with scikit-learn.
   Neither result feeds back into any choice.

Costs are always compared without the lambda penalty, so a large lambda is judged
on its predictions alone. The penalized cost is only what descent minimizes.
"""
from __future__ import annotations

import json
import math
import platform
import sys
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

from training.features import (build_matrix, location_lookup, split_by_month,
                               zscore_apply, zscore_fit)
from training.model import compute_cost, gradient_descent
from training.prep import (AREA_HIGH, AREA_LOW, COORD_COLUMNS, PPM2_HIGH, PPM2_LOW, RAW,
                           TOMAN_PER_BILLION, TOMAN_PER_MILLION, WINDOW_END,
                           WINDOW_START, run_clean)

ROOT = Path(__file__).resolve().parent.parent
MODEL_PATH = ROOT / "model" / "model.json"
DATA_DIR = ROOT / "web" / "public" / "data"
CARD_PATH = ROOT / "docs" / "DATA_CARD.md"

UNIT = "billion toman"
SEED = 42
# The largest eigenvalue of X'X/m is 4.4 for the widest candidate, so descent is
# stable below 2 / 4.4 = 0.45. The smallest is 0.016, and at alpha 0.3 the slowest
# direction shrinks by 0.995 per update, so 5,000 updates are plenty.
ALPHA = 0.3
ITERATIONS = 5000
# Penalty scale: lambda/m is the shrink per unit, and m is about 48,000. Below 10
# lambda would have no visible effect at all.
LAMBDAS = (0.0, 10.0, 100.0, 1000.0, 10000.0)
_REST = ("rooms", "age", "parking", "elevator", "storage")
_FULL = ("area", "location") + _REST
SUBSETS = (
    # Without location, to show what the neighborhood adds.
    ("area",),
    ("area",) + _REST,
    # Location with some or all of the other fields.
    ("location",),
    ("location", "area"),
    ("location", "age"),
    ("location", "rooms", "age"),
    ("location", "parking", "elevator", "storage"),
    ("location", "age", "parking", "elevator", "storage"),
    ("location",) + _REST,
    _FULL,
    # Leave one field out of the full set.
    tuple(f for f in _FULL if f != "rooms"),
    tuple(f for f in _FULL if f != "age"),
    tuple(f for f in _FULL if f != "parking"),
    tuple(f for f in _FULL if f != "elevator"),
    tuple(f for f in _FULL if f != "storage"),
    # Engineered squared terms.
    ("location", "location^2"),
    ("location", "location^2") + _REST,
    _FULL + ("area^2",),
    _FULL + ("location^2",),
    _FULL + ("area^2", "location^2"),
)
CANDIDATES = tuple((s, lam) for s in SUBSETS for lam in LAMBDAS)

HISTORY_POINTS = 120
CONVERGED_RELATIVE = 1e-7  # cost change over the last 100 updates
MIN_HEX_ROWS = 30
LISTING_COUNT = 60
LISTING_FIELDS = {"neighborhood", "area", "rooms", "age", "asked", "model", "difference"}
SAMPLE_COUNT = 500
SAMPLE_FIELDS = {"area", "rooms", "age", "parking", "elevator", "storage", "price"}
DIRTY_PER_SIDE = 12

# Same grid as the constructor in docs/design/Main.dc.html.
HEX_R = 7
_DX, _DY = HEX_R * 1.732, HEX_R * 1.5
_ROWS, _COLS = 26, 28
TEHRAN_POLYGON = [
    [264, 305], [282, 311], [293, 323], [342, 344], [341, 351], [344, 357], [385, 380],
    [397, 393], [404, 395], [432, 391], [436, 393], [441, 406], [443, 419], [459, 412],
    [468, 421], [471, 420], [462, 402], [462, 394], [471, 388], [487, 395], [490, 377],
    [487, 370], [493, 367], [499, 354], [489, 339], [483, 338], [493, 329], [493, 322],
    [507, 324], [513, 321], [524, 326], [521, 323], [539, 320], [533, 317], [543, 304],
    [529, 299], [517, 287], [501, 282], [502, 272], [507, 269], [503, 259], [499, 261],
    [490, 254], [481, 251], [466, 248], [459, 255], [446, 248], [442, 256], [425, 261],
    [419, 262], [422, 271], [411, 264], [402, 271], [398, 260], [393, 271], [383, 276],
    [377, 281], [366, 277], [357, 279], [351, 286], [341, 292], [319, 291], [312, 288],
    [275, 300], [267, 295]]

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
    y = train["price"].to_numpy(dtype=float)
    w, b, history = gradient_descent(Z, y, np.zeros(Z.shape[1]), 0.0, alpha, iterations,
                                     lambda_)
    return {"features": features, "lambda": lambda_, "lookup": lookup, "fallback": fallback,
            "mu": mu, "sigma": sigma, "w": w, "b": b, "history": history,
            "diverged": len(history) < iterations}


def predict_fit(fit: dict, df: pd.DataFrame) -> np.ndarray:
    X = build_matrix(df, fit["lookup"], fit["fallback"], fit["features"])
    return zscore_apply(X, fit["mu"], fit["sigma"]) @ fit["w"] + fit["b"]


def plain_cost(fit: dict, df: pd.DataFrame) -> float:
    """Cost with no penalty, so candidates compare on predictions alone."""
    X = build_matrix(df, fit["lookup"], fit["fallback"], fit["features"])
    return compute_cost(zscore_apply(X, fit["mu"], fit["sigma"]),
                        df["price"].to_numpy(dtype=float), fit["w"], fit["b"], 0.0)


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


def evaluate_held_out(fit: dict, held: pd.DataFrame) -> tuple[float, dict, np.ndarray]:
    """The single look at held-out rows, after all choices are fixed."""
    pred = predict_fit(fit, held)
    return plain_cost(fit, held), plain_gap(held["price"].to_numpy(dtype=float), pred), pred


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

    Z, y = matrix(train), train["price"].to_numpy(dtype=float)
    Z_held, y_held = matrix(held), held["price"].to_numpy(dtype=float)

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
    return Z @ np.array(model["weights"]) + model["bias"]


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
        "version": 1,
        "features": final["features"],
        "weights": final["w"].tolist(),
        "bias": final["b"],
        "scaling": {"mu": final["mu"].tolist(), "sigma": final["sigma"].tolist()},
        "location": {"lookup": final["lookup"], "fallback": final["fallback"]},
        "hyperparameters": {"alpha": alpha, "lambda": lambda_, "iterations": iterations},
        "cost": {"train": plain_cost(final, train),
                 "selection": plain_cost(final, selection),
                 "held_out": held_cost},
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
    }
    return {"model": model, "listings": build_listings(held, held_pred),
            "train": train, "selection": selection, "held_out": held,
            "held_pred": held_pred}


# --- hexagons -----------------------------------------------------------------

def project(lon, lat):
    """Longitude and latitude to the design map's coordinates."""
    return (lon - 50.6) / 1.6 * 864, (36.2 - lat) / 1.2 * 800


def inside(x: float, y: float) -> bool:
    """Ray casting, the same test as `inside` in Main.dc.html."""
    c, poly = False, TEHRAN_POLYGON
    j = len(poly) - 1
    for i in range(len(poly)):
        a, b = poly[i], poly[j]
        if (a[1] > y) != (b[1] > y) and x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]:
            c = not c
        j = i
    return c


def grid_centers() -> np.ndarray:
    return np.array([(256 + col * _DX + (_DX / 2 if row % 2 else 0), 244 + row * _DY)
                     for row in range(_ROWS) for col in range(_COLS)])


def hex_path(x: float, y: float) -> str:
    """Pointy-top hexagon path, formatted like the design's SVG paths."""
    points = []
    for k in range(6):
        t = math.pi / 3 * k + math.pi / 6
        points.append(f"{x + HEX_R * math.cos(t):.1f} {y + HEX_R * math.sin(t):.1f}")
    return "M" + " L".join(points) + " Z"


def build_hexes(train_coords: pd.DataFrame, min_rows: int = MIN_HEX_ROWS) -> list[dict]:
    """Median price per m2 in each hexagon with enough training listings.

    Only the grid center, the median and the most common slug leave this function.
    """
    known = train_coords[train_coords["lat"].notna() & train_coords["lon"].notna()]
    centers = grid_centers()
    px, py = project(known["lon"].to_numpy(float), known["lat"].to_numpy(float))
    nearest = np.empty(len(known), dtype=int)
    dist2 = np.empty(len(known))
    for start in range(0, len(known), 4096):   # chunks keep the distance matrix small
        dx = px[start:start + 4096, None] - centers[:, 0]
        dy = py[start:start + 4096, None] - centers[:, 1]
        d2 = dx * dx + dy * dy
        nearest[start:start + 4096] = d2.argmin(axis=1)
        dist2[start:start + 4096] = d2.min(axis=1)
    keep = dist2 <= HEX_R * HEX_R
    prices = known["price_per_m2"].to_numpy(float)[keep]
    slugs = known["neighborhood"].to_numpy(object)[keep]
    cells = nearest[keep]

    out = []
    for cell in np.unique(cells):
        x, y = centers[cell]
        if not inside(x, y):
            continue
        mask = cells == cell
        if mask.sum() < min_rows:
            continue
        counts = Counter(s for s in slugs[mask] if isinstance(s, str))
        # Highest count first, alphabetical on a tie, so the result is stable.
        slug = min(counts, key=lambda s: (-counts[s], s)) if counts else None
        out.append({"d": hex_path(x, y), "value": round(float(np.median(prices[mask])), 1),
                    "neighborhood": slug})
    return out


# --- exports ------------------------------------------------------------------

def label(slug) -> str:
    if not isinstance(slug, str) or not slug.strip():
        return "Unknown"
    return slug.replace("-", " ").replace("_", " ").title()


def build_neighborhoods(lookup: dict[str, float]) -> list[dict]:
    rows = [{"id": k, "label": label(k), "median": round(float(v), 2)}
            for k, v in lookup.items()]
    return sorted(rows, key=lambda r: (r["label"], r["id"]))


def pick_listings(held: pd.DataFrame, n: int = LISTING_COUNT, seed: int = SEED) -> pd.DataFrame:
    """Random rows. Takes no predictions, so the pick cannot depend on error size."""
    picks = np.random.default_rng(seed).choice(len(held), min(n, len(held)), replace=False)
    return held.iloc[np.sort(picks)]


def build_listings(held: pd.DataFrame, pred: np.ndarray) -> list[dict]:
    pred = pd.Series(pred, index=held.index)
    rows = []
    for idx, r in pick_listings(held).iterrows():
        asked, model = round(float(r["price"]), 2), round(float(pred[idx]), 2)
        rows.append({"neighborhood": label(r["neighborhood"]),
                     "area": round(float(r["area"]), 1), "rooms": int(r["rooms"]),
                     "age": int(r["age"]), "asked": asked, "model": model,
                     "difference": round(model - asked, 2)})
    return rows


def build_sample(train: pd.DataFrame, n: int = SAMPLE_COUNT, seed: int = SEED) -> list[dict]:
    picks = np.random.default_rng(seed).choice(len(train), min(n, len(train)), replace=False)
    return [{"area": round(float(r["area"]), 1), "rooms": int(r["rooms"]), "age": int(r["age"]),
             "parking": int(r["parking"]), "elevator": int(r["elevator"]),
             "storage": int(r["storage"]), "price": round(float(r["price"]), 3)}
            for _, r in train.iloc[np.sort(picks)].iterrows()]


def dirty_prices(raw: pd.DataFrame, per_side: int = DIRTY_PER_SIDE, seed: int = SEED) -> list[float]:
    """Prices of real ads the price-per-m2 bounds remove, in billions. Bare numbers.

    Taken from ads inside the window with a plausible area, half from below the low
    bound and half from above the high bound, drawn at random.
    """
    month = pd.to_datetime(raw["created_at_month"], errors="coerce").dt.strftime("%Y-%m")
    area = pd.to_numeric(raw["building_size"], errors="coerce")
    price = pd.to_numeric(raw["price_value"], errors="coerce")
    usable = (month >= WINDOW_START) & (month <= WINDOW_END) & area.between(AREA_LOW, AREA_HIGH) & (price > 0)
    ppm2 = price[usable] / area[usable] / TOMAN_PER_MILLION
    rng = np.random.default_rng(seed)
    out: list[float] = []
    for side in (ppm2 < PPM2_LOW, ppm2 > PPM2_HIGH):
        values = np.sort(price[usable][side].unique())
        picks = rng.choice(len(values), min(per_side, len(values)), replace=False)
        out += [float(v) / TOMAN_PER_BILLION for v in values[np.sort(picks)]]
    return out


def build_profile(df: pd.DataFrame, raw: pd.DataFrame, model: dict) -> dict:
    """Numbers for the Data page. No row-level values."""
    used = set(model["features"]) | {"price"}
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
    hp, cost, gap, sk = (model["hyperparameters"], model["cost"], model["held_out_gap"],
                         model["sklearn_cost"])
    lines = [
        "### Chosen model and held-out result (generated)",
        "",
        f"Features: `{', '.join(model['features'])}`. Lambda {hp['lambda']:g}, "
        f"alpha {hp['alpha']:g}, {hp['iterations']:,} updates. "
        f"Rows: {model['rows']['train']:,} train, {model['rows']['selection']:,} selection, "
        f"{model['rows']['held_out']:,} held-out.",
        "",
        "| Cost, no penalty (billion toman squared, halved) | Value |",
        "|---|---|",
        f"| Train | {cost['train']:.4f} |",
        f"| Selection, 2024-10 | {cost['selection']:.4f} |",
        f"| Held-out, 2024-11 and 2024-12 | {cost['held_out']:.4f} |",
    ]
    lines.append(f"| scikit-learn LinearRegression, same features, held-out | "
                 f"{sk['linear_regression']:.4f} |")
    if "ridge" in sk:
        lines.append(f"| scikit-learn Ridge, same features and lambda, held-out | {sk['ridge']:.4f} |")
    lines += [
        "",
        "How far off on held-out listings, with simpler rules for comparison. "
        "None of these rows fed into any choice.",
        "",
        "| Predictor | Cost | Median gap (billions) | Median gap (share of price) | 90th percentile gap (billions) | 90th percentile gap (share) |",
        "|---|---|---|---|---|---|",
    ]
    rows = [("This model", {"cost": cost["held_out"], **gap})] + list(baselines.items())
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
    neg = int((p <= 0).sum())
    lines += ["", f"Held-out predictions at or below zero: {neg:,} of {len(p):,}.", "",
              "### All candidates tried (generated)", "",
              f"Every candidate used alpha {hp['alpha']:g} and {hp['iterations']:,} updates. "
              "Sorted by selection cost, the only thing that decided the choice. "
              "\"Settled\" means the cost moved by under one part in ten million over the last 100 updates.",
              "", "| Features | Lambda | Selection cost | Train cost | Settled | Chosen |",
              "|---|---|---|---|---|---|"]
    ok = sorted((c for c in model["candidates"] if c["selection_cost"] is not None),
                key=lambda c: c["selection_cost"])
    bad = [c for c in model["candidates"] if c["selection_cost"] is None]
    for c in ok:
        lines.append(f"| {', '.join(c['features'])} | {c['lambda']:g} | {c['selection_cost']:.4f} | "
                     f"{c['train_cost']:.4f} | {'yes' if c['converged'] else 'no'} | "
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

    train_coords, _, _ = split_by_month(frame)
    hexes = build_hexes(train_coords)
    # Coordinates end here. Nothing below can see them.
    df = frame.drop(columns=COORD_COLUMNS)

    result = train_model(df)
    model, train, held = result["model"], result["train"], result["held_out"]

    sizes = {
        "model/model.json": write_json(MODEL_PATH, model),
        "hexes.json": write_json(DATA_DIR / "hexes.json", hexes),
        "listings.json": write_json(DATA_DIR / "listings.json", result["listings"]),
        "sample.json": write_json(DATA_DIR / "sample.json", {
            "rows": build_sample(train), "dirty_prices": dirty_prices(raw)}),
        "funnel.json": write_json(DATA_DIR / "funnel.json", steps),
        "profile.json": write_json(DATA_DIR / "profile.json", build_profile(df, raw, model)),
        "neighborhoods.json": write_json(DATA_DIR / "neighborhoods.json",
                                         build_neighborhoods(model["location"]["lookup"])),
    }
    update_card(CARD_PATH, card_body(model, held["price"].to_numpy(dtype=float),
                                     result["held_pred"], _baselines(train, held)))

    print("chosen:", model["features"], "lambda", model["hyperparameters"]["lambda"])
    print("cost:", model["cost"], "sklearn:", model["sklearn_cost"])
    print("gap:", model["held_out_gap"])
    print("runtime_ms:", model["runtime_ms"])
    print("hexes:", len(hexes), "not in lookup:",
          sum(h["neighborhood"] not in model["location"]["lookup"] for h in hexes))
    print("sizes:", sizes, "total", sum(sizes.values()))


if __name__ == "__main__":
    sys.exit(main())
