"""Write Lab engine fixtures: what training/model.py computes on the site's sample.

The Lab page runs gradient descent in the browser (web/src/lab/engine.ts). This
script runs the same experiments through training/model.py on
web/public/data/sample.json and writes web/src/lab/fixtures.json. The web tests
replay each experiment in TypeScript and compare within 1e-6 relative.
Rerun it whenever sample.json changes.

    python -m training.export_lab_fixtures

State indexing. A run of `iters` updates has iters + 1 states, 0 to iters. State
k is the point after k updates, so state 0 is the starting point. jHistory[k - 1]
is the cost of state k (model.gradient_descent's J_history), and a checkpoint
holds the exact point and gradient of state k. `divergedAt` is the first state
whose cost is not finite or is above COST_LIMIT, or None. The browser stops
there and keeps only the states before it.
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from training.features import zscore_apply, zscore_fit  # noqa: E402
from training.model import compute_cost, compute_gradient, gradient_descent  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SAMPLE_PATH = ROOT / "web" / "public" / "data" / "sample.json"
FIXTURES_PATH = ROOT / "web" / "src" / "lab" / "fixtures.json"
COST_LIMIT = 1e9
COLUMNS = ["area", "rooms", "age", "parking"]

# (name, w0, b0, alpha, iters). Single feature: x = area / 100.
RUN_ONE = [
    ("slow", 0.0, 0.0, 0.05, 150),
    ("start-away", 6.0, -4.0, 0.3, 120),
    ("diverges", 0.0, 0.0, 2.5, 60),
]
# (name, scaled, alpha, iters). Four features, starting from zero.
RUN_MULTI = [
    ("raw", False, 1e-5, 120),
    ("scaled", True, 0.1, 200),
    ("scaled-fast", True, 0.8, 80),
    ("raw-diverges", False, 1e-3, 40),
    ("scaled-diverges", True, 3.0, 40),
]
# (name, degree, lambda, alpha, iters). x = z-scored area, all rows.
POLY = [
    ("degree-1", 1, 0.0, 0.1, 300),
    ("degree-3", 3, 0.0, 0.1, 400),
    ("degree-3-ridge", 3, 50.0, 0.1, 400),
    ("degree-9", 9, 1.0, 0.05, 300),
]


def load_arrays(sample: dict) -> tuple[np.ndarray, np.ndarray]:
    rows = sample["rows"]
    X = np.array([[r[c] for c in COLUMNS] for r in rows], dtype=float)
    y = np.array([r["price"] for r in rows], dtype=float)
    return X, y


def diverged_at(j0: float, history: list[float], iters: int) -> int | None:
    states = [j0] + list(history)
    for i, c in enumerate(states):
        if not math.isfinite(c) or c > COST_LIMIT:
            return i
    return len(states) if len(history) < iters else None


def checkpoint_ks(iters: int, limit: int | None) -> list[int]:
    ks = sorted({0, 1, 2, 10, iters // 2, iters})
    return [k for k in ks if k <= iters and (limit is None or k < limit)]


def descend(X, y, w0, b0, alpha, iters, lam=0.0) -> dict:
    """The model.py descent, summarized as the fixtures need it."""
    w0 = np.asarray(w0, dtype=float)
    _, _, history = gradient_descent(X, y, w0, b0, alpha, iters, lam)
    j0 = compute_cost(X, y, w0, b0, lam)
    at = diverged_at(j0, history, iters)
    checkpoints = []
    for k in checkpoint_ks(iters, at):
        w, b, _ = gradient_descent(X, y, w0, b0, alpha, k, lam)
        gw, gb = compute_gradient(X, y, w, b, lam)
        checkpoints.append({"k": k, "w": [float(v) for v in w], "b": float(b),
                            "j": float(compute_cost(X, y, w, b, lam)),
                            "gw": [float(v) for v in gw], "gb": float(gb)})
    return {"alpha": alpha, "iters": iters, "divergedAt": at,
            "jHistory": [float(c) for c in history], "j0": float(j0),
            "checkpoints": checkpoints}


def run_one_case(X, y, name, w0, b0, alpha, iters) -> dict:
    x = (X[:, [0]] / 100.0)
    case = descend(x, y, [w0], b0, alpha, iters)
    for c in case["checkpoints"]:  # one feature: w and gw are single numbers
        c["w"], c["gw"] = c["w"][0], c["gw"][0]
    return {"name": name, "w0": w0, "b0": b0, **case}


def run_multi_case(X, Xz, y, name, scaled, alpha, iters) -> dict:
    A = Xz if scaled else X
    case = descend(A, y, np.zeros(A.shape[1]), 0.0, alpha, iters)
    for c in case["checkpoints"]:
        del c["gw"], c["gb"]
    return {"name": name, "scaled": scaled, **case}


def poly_case(zs, y, name, degree, lam, alpha, iters) -> dict:
    P = np.column_stack([zs ** p for p in range(1, degree + 1)])
    mu, sigma = zscore_fit(P)
    Pz = zscore_apply(P, mu, sigma)
    w, b, history = gradient_descent(Pz, y, np.zeros(degree), 0.0, alpha, iters, lam)
    return {"name": name, "degree": degree, "lambda": lam, "alpha": alpha, "iters": iters,
            "mu": [float(v) for v in mu], "sigma": [float(v) for v in sigma],
            "theta": [float(b)] + [float(v) for v in w],
            "jHistory": [float(c) for c in history],
            "cost": float(compute_cost(Pz, y, w, b, 0.0))}


def build_fixtures(sample: dict) -> dict:
    X, y = load_arrays(sample)
    mu, sigma = zscore_fit(X)
    Xz = zscore_apply(X, mu, sigma)
    zs = Xz[:, 0]
    return {
        "rows": len(y),
        "zscore": {"columns": COLUMNS, "mu": [float(v) for v in mu],
                   "sigma": [float(v) for v in sigma],
                   "first": [[float(v) for v in r] for r in Xz[:5]]},
        "runOne": [run_one_case(X, y, *c) for c in RUN_ONE],
        "runMulti": [run_multi_case(X, Xz, y, *c) for c in RUN_MULTI],
        "polyFit": [poly_case(zs, y, *c) for c in POLY],
    }


def main() -> None:
    sample = json.loads(SAMPLE_PATH.read_text(encoding="utf-8"))
    fx = build_fixtures(sample)
    FIXTURES_PATH.parent.mkdir(parents=True, exist_ok=True)
    FIXTURES_PATH.write_text(json.dumps(fx, indent=1, allow_nan=False) + "\n",
                             encoding="utf-8", newline="\n")
    print(f"wrote {len(fx['runOne'])} runOne, {len(fx['runMulti'])} runMulti, "
          f"{len(fx['polyFit'])} polyFit cases to {FIXTURES_PATH}")


if __name__ == "__main__":
    main()
