import re
from pathlib import Path

import numpy as np
import pytest
from sklearn.linear_model import LinearRegression

from training import model
from training.model import (
    compute_cost,
    compute_gradient,
    gradient_descent,
    predict,
)

LAB_NAMES = [
    "predict_loop",
    "compute_cost_loop",
    "compute_gradient_loop",
    "gradient_descent",
    "compute_cost_reg",
    "compute_gradient_reg",
]


def make_data(m=40, n=3, seed=0, noise=0.1):
    rng = np.random.default_rng(seed)
    X = rng.normal(size=(m, n))
    w_true = np.array([2.0, -1.0, 0.5])[:n]
    y = X @ w_true + 3.0 + noise * rng.normal(size=m)
    return X, y


def numeric_gradient(X, y, w, b, lambda_, eps=1e-6):
    dw = np.zeros_like(w)
    for j in range(len(w)):
        hi, lo = w.copy(), w.copy()
        hi[j] += eps
        lo[j] -= eps
        dw[j] = (compute_cost(X, y, hi, b, lambda_) - compute_cost(X, y, lo, b, lambda_)) / (2 * eps)
    db = (compute_cost(X, y, w, b + eps, lambda_) - compute_cost(X, y, w, b - eps, lambda_)) / (2 * eps)
    return dw, db


def test_predict_shapes_and_values():
    X = np.array([[1.0, 2.0], [3.0, 4.0]])
    out = predict(X, np.array([0.5, -1.0]), 2.0)
    assert out.shape == (2,)
    assert np.allclose(out, [0.5 - 2.0 + 2.0, 1.5 - 4.0 + 2.0])


def test_cost_known_value_and_penalty():
    X = np.array([[1.0], [2.0]])
    y = np.array([1.0, 2.0])
    w, b = np.array([2.0]), 0.0
    # errors 1 and 2 -> (1 + 4) / (2*2)
    assert compute_cost(X, y, w, b) == pytest.approx(5 / 4)
    # penalty lambda/(2m) * w^2 = 3 * 4 / 4
    assert compute_cost(X, y, w, b, lambda_=3.0) == pytest.approx(5 / 4 + 3 * 4 / 4)


@pytest.mark.parametrize("lambda_", [0.0, 0.7])
def test_gradient_matches_numeric(lambda_):
    X, y = make_data()
    w, b = np.array([0.3, -0.2, 0.9]), 0.4
    dw, db = compute_gradient(X, y, w, b, lambda_)
    ndw, ndb = numeric_gradient(X, y, w, b, lambda_)
    assert np.max(np.abs(dw - ndw)) < 1e-5
    assert abs(db - ndb) < 1e-5


def test_bias_not_in_penalty():
    X, y = make_data()
    w = np.array([0.3, -0.2, 0.9])
    for b in (0.0, 5.0):
        assert compute_cost(X, y, w, b, 10.0) - compute_cost(X, y, w, b, 0.0) == pytest.approx(
            10.0 / (2 * len(y)) * np.sum(w**2)
        )
    _, db0 = compute_gradient(X, y, w, 1.0, 0.0)
    _, db1 = compute_gradient(X, y, w, 1.0, 50.0)
    assert db0 == db1


def test_penalty_shrinks_weights():
    X, y = make_data()
    w0, b0 = np.zeros(3), 0.0
    w_free, _, _ = gradient_descent(X, y, w0, b0, 0.1, 500, 0.0)
    w_reg, _, _ = gradient_descent(X, y, w0, b0, 0.1, 500, 20.0)
    assert np.linalg.norm(w_reg) < np.linalg.norm(w_free)


def test_cost_falls_at_small_alpha():
    X, y = make_data()
    _, _, hist = gradient_descent(X, y, np.zeros(3), 0.0, 0.05, 200)
    assert len(hist) == 200
    assert hist[-1] < hist[0]
    assert all(b <= a + 1e-12 for a, b in zip(hist, hist[1:]))


def test_matches_sklearn_on_scaled_data():
    rng = np.random.default_rng(1)
    raw = rng.normal(loc=[50, 3, 10], scale=[20, 1, 5], size=(200, 3))
    X = (raw - raw.mean(axis=0)) / raw.std(axis=0)
    y = X @ np.array([4.0, 1.0, -2.0]) + 7.0 + 0.2 * rng.normal(size=200)
    w, b, _ = gradient_descent(X, y, np.zeros(3), 0.0, 0.1, 3000)
    ref = LinearRegression().fit(X, y)
    assert np.allclose(w, ref.coef_, atol=1e-2)
    assert abs(b - ref.intercept_) < 1e-2


def test_two_runs_identical():
    X, y = make_data()
    a = gradient_descent(X, y, np.zeros(3), 0.0, 0.05, 100, 0.3)
    c = gradient_descent(X, y, np.zeros(3), 0.0, 0.05, 100, 0.3)
    assert np.array_equal(a[0], c[0]) and a[1] == c[1] and a[2] == c[2]


def test_inputs_never_mutated():
    X, y = make_data()
    w, b = np.array([0.1, 0.2, 0.3]), 0.5
    X0, y0, w0 = X.copy(), y.copy(), w.copy()
    w_out, _, _ = gradient_descent(X, y, w, b, 0.05, 20, 0.3)
    assert np.array_equal(X, X0) and np.array_equal(y, y0) and np.array_equal(w, w0)
    assert w_out is not w


def test_simultaneous_update_single_step():
    X, y = make_data()
    w, b = np.array([0.1, 0.2, 0.3]), 0.5
    dw, db = compute_gradient(X, y, w, b, 0.2)
    w1, b1, hist = gradient_descent(X, y, w, b, 0.05, 1, 0.2)
    assert np.allclose(w1, w - 0.05 * dw)
    assert b1 == pytest.approx(b - 0.05 * db)
    assert hist == [pytest.approx(compute_cost(X, y, w1, b1, 0.2))]


def test_divergence_stops_early_with_finite_history():
    X, y = make_data()
    w, b, hist = gradient_descent(X, y, np.zeros(3), 0.0, 50.0, 5000)
    assert 0 < len(hist) < 5000
    assert np.all(np.isfinite(hist))
    assert np.all(np.isfinite(w)) and np.isfinite(b)
    assert np.isfinite(compute_cost(X, y, w, b))


def test_divergence_emits_no_numpy_warning(recwarn):
    X, y = make_data()
    gradient_descent(X, y, np.zeros(3), 0.0, 1e3, 5000)
    assert not [r for r in recwarn if issubclass(r.category, RuntimeWarning)]


def test_loop_versions_match_vectorized():
    X, y = make_data(m=15)
    w, b = np.array([0.3, -0.2, 0.9]), 0.4
    assert np.allclose(model.predict_loop(X, w, b), predict(X, w, b))
    assert model.compute_cost_loop(X, y, w, b) == pytest.approx(compute_cost(X, y, w, b))
    dw, db = model.compute_gradient_loop(X, y, w, b)
    vdw, vdb = compute_gradient(X, y, w, b)
    assert np.allclose(dw, vdw) and db == pytest.approx(vdb)
    assert model.compute_cost_reg(X, y, w, b, 0.8) == pytest.approx(compute_cost(X, y, w, b, 0.8))
    dw, db = model.compute_gradient_reg(X, y, w, b, 0.8)
    vdw, vdb = compute_gradient(X, y, w, b, 0.8)
    assert np.allclose(dw, vdw) and db == pytest.approx(vdb)


def test_lab_markers_are_balanced_and_named():
    src = Path(model.__file__).read_text(encoding="utf-8").splitlines()
    names, open_name = [], None
    for line in src:
        s = line.strip()
        m = re.fullmatch(r"# lab:(\w+)", s)
        if m:
            assert open_name is None, "nested lab block"
            open_name = m.group(1)
            names.append(open_name)
        elif s == "# endlab":
            assert open_name is not None, "endlab without lab"
            open_name = None
    assert open_name is None, "unterminated lab block"
    assert sorted(names) == sorted(LAB_NAMES)
