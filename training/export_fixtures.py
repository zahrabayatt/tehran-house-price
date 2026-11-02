"""Write parity fixtures: inputs plus what the Python model predicts for them.

The browser must give the same numbers as `predict_from_model`, which reads only
model/model.json. This script draws inputs with a fixed seed, runs them through
that Python path, and writes web/src/model/fixtures.json. The web tests replay
the inputs in TypeScript and compare. Rerun it whenever the model is retrained.

    python -m training.export_fixtures
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from training.features import build_matrix, zscore_apply  # noqa: E402
from training.prep import LATEST_YEAR  # noqa: E402
from training.train import MODEL_PATH, predict_from_model  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
FIXTURES_PATH = ROOT / "web" / "src" / "model" / "fixtures.json"
SEED = 7
RANDOM_COUNT = 40
YEAR_MIN, YEAR_MAX = 1370, LATEST_YEAR
AREA_MIN, AREA_MAX = 25.0, 600.0

# Hand-picked edges: the corners of the allowed input range and the fallback paths.
EDGE_INPUTS = [
    {"area": 25.0, "neighborhood": None, "rooms": 0, "year": 1403,
     "parking": 0, "elevator": 0, "storage": 0},
    {"area": 600.0, "neighborhood": "no-such-neighborhood", "rooms": 5, "year": 1370,
     "parking": 1, "elevator": 1, "storage": 1},
    {"area": 120.5, "neighborhood": "", "rooms": 3, "year": 1395,
     "parking": 1, "elevator": 0, "storage": 1},
    # The model goes negative here (about -3.5 billion): the "too small" case.
    {"area": 25.0, "neighborhood": "sharifabad", "rooms": 1, "year": 1370,
     "parking": 1, "elevator": 1, "storage": 0},
]


def random_inputs(model: dict, n: int = RANDOM_COUNT, seed: int = SEED) -> list[dict]:
    """n inputs. Every fifth one uses a neighborhood the model has never seen."""
    rng = np.random.default_rng(seed)
    slugs = sorted(model["location"]["lookup"])
    rows = []
    for i in range(n):
        if i % 5 == 4:
            hood = f"unseen-neighborhood-{i}"
        else:
            hood = slugs[int(rng.integers(len(slugs)))]
        rows.append({
            "area": round(float(rng.uniform(AREA_MIN, 300.0)), 1),
            "neighborhood": hood,
            "rooms": int(rng.integers(0, 6)),
            "year": int(rng.integers(YEAR_MIN, YEAR_MAX + 1)),
            "parking": int(rng.integers(0, 2)),
            "elevator": int(rng.integers(0, 2)),
            "storage": int(rng.integers(0, 2)),
        })
    return rows


def to_frame(inputs: list[dict]) -> pd.DataFrame:
    df = pd.DataFrame(inputs)
    df["age"] = LATEST_YEAR - df["year"]
    df["neighborhood"] = df["neighborhood"].map(
        lambda s: s if isinstance(s, str) and s != "" else None)
    return df


def build_fixtures(model: dict) -> dict:
    inputs = EDGE_INPUTS + random_inputs(model)
    df = to_frame(inputs)
    totals = predict_from_model(model, df)
    # Per-feature contribution in billions: z-score times weight, no bias.
    X = build_matrix(df, model["location"]["lookup"], model["location"]["fallback"],
                     model["features"])
    Z = zscore_apply(X, np.array(model["scaling"]["mu"]), np.array(model["scaling"]["sigma"]))
    parts = Z * np.array(model["weights"])
    cases = []
    for inp, total, row in zip(inputs, totals, parts):
        cases.append({
            "input": inp,
            "expected": float(total),
            "featureContributions": dict(zip(model["features"], map(float, row))),
        })
    return {"modelBias": model["bias"], "features": model["features"], "cases": cases}


def main() -> None:
    model = json.loads(Path(MODEL_PATH).read_text(encoding="utf-8"))
    fx = build_fixtures(model)
    FIXTURES_PATH.parent.mkdir(parents=True, exist_ok=True)
    FIXTURES_PATH.write_text(json.dumps(fx, indent=1, allow_nan=False) + "\n",
                             encoding="utf-8", newline="\n")
    print(f"wrote {len(fx['cases'])} cases to {FIXTURES_PATH}")


if __name__ == "__main__":
    main()
