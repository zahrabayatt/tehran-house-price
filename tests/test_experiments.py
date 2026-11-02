"""The Lab's teaching code must agree with the production code it explains."""
import json
import re
from pathlib import Path

import numpy as np
import pytest

from training import experiments as E
from training.model import compute_cost, compute_gradient, gradient_descent, predict

ROOT = Path(__file__).resolve().parent.parent
SAMPLE = json.loads((ROOT / "web" / "public" / "data" / "sample.json").read_text(encoding="utf-8"))
SOURCES = sorted((ROOT / "training").glob("*.py"))


def one_feature():
    x, y, m = E.load_xy(SAMPLE["rows"])
    return x, y, m


def test_load_xy_uses_hundreds_of_square_metres():
    x, y, m = one_feature()
    assert m == len(SAMPLE["rows"]) == x.shape[0] == y.shape[0]
    assert x[0] == pytest.approx(SAMPLE["rows"][0]["area"] / 100)
    assert y[0] == SAMPLE["rows"][0]["price"]


def test_price_range_keeps_only_prices_inside_both_bounds():
    kept = E.keep_price_range([0.1, 1.0, 5.0, 300.0, 5000.0], 1.0, 300.0)
    assert kept.tolist() == [1.0, 5.0, 300.0]


def test_one_feature_functions_match_the_vectorized_code():
    x, y, _ = one_feature()
    X = x.reshape(-1, 1)
    w, b = 6.5, -2.0
    assert np.allclose(E.predict_one(x, w, b), predict(X, [w], b))
    assert E.cost_one(x, y, w, b) == pytest.approx(compute_cost(X, y, [w], b))
    dw, db = E.gradient_one(x, y, w, b)
    vdw, vdb = compute_gradient(X, y, [w], b)
    assert dw == pytest.approx(vdw[0]) and db == pytest.approx(vdb)


def test_one_feature_descent_matches_gradient_descent():
    x, y, _ = one_feature()
    w, b, hist = E.descent_one(x, y, 0.0, 0.0, 0.3, 50)
    vw, vb, vhist = gradient_descent(x.reshape(-1, 1), y, [0.0], 0.0, 0.3, 50)
    assert w == pytest.approx(vw[0]) and b == pytest.approx(vb)
    assert np.allclose(hist, vhist)
    assert hist[-1] < hist[0]


def test_dot_loop_and_vectorized_gradient():
    rng = np.random.default_rng(1)
    a, c = rng.random(200), rng.random(200)
    assert E.dot_loop(a, c) == pytest.approx(float(np.dot(a, c)))
    X, y = rng.normal(size=(30, 3)), rng.normal(size=30)
    w, b = rng.normal(size=3), 0.4
    dw, db = E.gradient_vec(X, y, w, b)
    vdw, vdb = compute_gradient(X, y, w, b)
    assert np.allclose(dw, vdw) and db == pytest.approx(vdb)


def test_time_dot_reports_positive_measurements():
    r = E.time_dot(size=20_000, repeats=2)
    assert r["elements"] == 20_000 and r["loop_ms"] > 0 and r["numpy_ms"] > 0


def test_race_learning_rates_returns_a_history_per_rate():
    x, y, _ = one_feature()
    X = np.column_stack([x, x ** 2])
    out = E.race_learning_rates(X, y, [0.001, 0.01], num_iters=20)
    assert set(out) == {0.001, 0.01} and all(len(h) == 20 for h in out.values())


def test_poly_features_and_degree_fits():
    x = np.array([1.0, 2.0, 3.0])
    assert E.poly_features(x, 3).tolist() == [[1, 1, 1], [2, 4, 8], [3, 9, 27]]
    zx, y, _ = one_feature()
    zx = (zx - zx.mean()) / zx.std()
    fits = E.fit_degrees(zx[:16], y[:16], [1, 3], num_iters=100)
    assert set(fits) == {1, 3} and fits[3][0].shape == (3,)


def test_every_lab_block_is_balanced_unique_and_named_in_snake_case():
    names = []
    for path in SOURCES:
        open_name = None
        for line in path.read_text(encoding="utf-8").splitlines():
            s = line.strip()
            m = re.fullmatch(r"# lab:(\w+)", s)
            if m:
                assert open_name is None, f"nested lab block in {path.name}"
                open_name = m.group(1)
                names.append(open_name)
            elif s == "# endlab":
                assert open_name is not None, f"endlab without lab in {path.name}"
                open_name = None
        assert open_name is None, f"unterminated lab block in {path.name}"
    assert len(names) == len(set(names)), "a lab block name is used twice"
    assert all(re.fullmatch(r"[a-z][a-z0-9_]*", n) for n in names)


def test_model_json_stores_a_vectorization_measurement():
    v = json.loads((ROOT / "model" / "model.json").read_text(encoding="utf-8"))["vectorization"]
    assert v["elements"] > 0 and v["loop_ms"] > 0 and v["numpy_ms"] > 0
    assert v["loop_ms"] > v["numpy_ms"]
