"""Teaching code for the Model Lab, one small function per idea.

Each block between `# lab:<name>` and `# endlab` is shown on the Lab page line by
line, so it is plain on purpose: loops where a loop explains the idea, no tricks.
The production code is training/model.py (vectorized) and training/train.py. Every
function here is run by tests/test_experiments.py and checked against that code.

    python -m training.experiments

measures a Python loop against NumPy and stores the result under "vectorization"
in model/model.json, which the Lab's vectorization step displays. training/train.py
stores the same measurement whenever it trains.
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import numpy as np

from training.features import zscore_apply, zscore_fit
from training.model import gradient_descent

ROOT = Path(__file__).resolve().parent.parent
MODEL_PATH = ROOT / "model" / "model.json"


# lab:load_xy
def load_xy(rows):
    x_train = np.array([r["area"] for r in rows]) / 100
    y_train = np.array([r["price"] for r in rows])
    m = x_train.shape[0]
    return x_train, y_train, m
# endlab


# lab:price_bounds
def keep_price_range(prices, low, high):
    prices = np.asarray(prices, dtype=float)
    keep = (prices >= low) & (prices <= high)
    return prices[keep]
# endlab


# lab:predict_one
def predict_one(x, w, b):
    m = x.shape[0]
    f_wb = np.zeros(m)
    for i in range(m):
        f_wb[i] = w * x[i] + b
    return f_wb
# endlab


# lab:cost_one
def cost_one(x, y, w, b):
    m = x.shape[0]
    cost_sum = 0.0
    for i in range(m):
        f_wb = w * x[i] + b
        cost_sum += (f_wb - y[i]) ** 2
    return cost_sum / (2 * m)
# endlab


# lab:gradient_one
def gradient_one(x, y, w, b):
    m = x.shape[0]
    dj_dw = 0.0
    dj_db = 0.0
    for i in range(m):
        err = (w * x[i] + b) - y[i]
        dj_dw += err * x[i]
        dj_db += err
    return dj_dw / m, dj_db / m
# endlab


# lab:descent_one
def descent_one(x, y, w, b, alpha, num_iters):
    J_history = []
    for _ in range(num_iters):
        dj_dw, dj_db = gradient_one(x, y, w, b)
        w = w - alpha * dj_dw
        b = b - alpha * dj_db
        J_history.append(cost_one(x, y, w, b))
    return w, b, J_history
# endlab


# lab:dot_loop
def dot_loop(a, b):
    total = 0.0
    for i in range(a.shape[0]):
        total = total + a[i] * b[i]
    return total
# endlab


# lab:time_dot
def time_dot(size=1_000_000, repeats=5):
    rng = np.random.default_rng(0)
    a, b = rng.random(size), rng.random(size)
    best_loop = float("inf")
    best_numpy = float("inf")
    for _ in range(repeats):
        tic = time.perf_counter()
        dot_loop(a, b)
        best_loop = min(best_loop, time.perf_counter() - tic)
        tic = time.perf_counter()
        np.dot(a, b)
        best_numpy = min(best_numpy, time.perf_counter() - tic)
    return {"elements": size, "loop_ms": best_loop * 1000, "numpy_ms": best_numpy * 1000}
# endlab


# lab:gradient_vec
def gradient_vec(X, y, w, b):
    m = X.shape[0]
    err = X @ w + b - y
    dj_dw = X.T @ err / m
    dj_db = err.mean()
    return dj_dw, dj_db
# endlab


# lab:lr_race
def race_learning_rates(X, y, alphas, num_iters=100):
    histories = {}
    for alpha in alphas:
        w0, b0 = np.zeros(X.shape[1]), 0.0
        w, b, J_history = gradient_descent(X, y, w0, b0, alpha, num_iters)
        histories[alpha] = J_history
    return histories
# endlab


# lab:poly_features
def poly_features(x, degree):
    return np.column_stack([x ** p for p in range(1, degree + 1)])
# endlab


# lab:fit_degrees
def fit_degrees(x_train, y_train, degrees, num_iters=500):
    fits = {}
    for degree in degrees:
        X_poly = poly_features(x_train, degree)
        mu, sigma = zscore_fit(X_poly)
        X_poly = zscore_apply(X_poly, mu, sigma)
        alpha = 1 / (degree + 1)
        w, b, _ = gradient_descent(X_poly, y_train, np.zeros(degree), 0.0, alpha, num_iters)
        fits[degree] = (w, b, mu, sigma)
    return fits
# endlab


def main() -> None:
    result = time_dot()
    model = json.loads(MODEL_PATH.read_text(encoding="utf-8"))
    model["vectorization"] = result
    text = json.dumps(model, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    MODEL_PATH.write_text(text + "\n", encoding="utf-8", newline="\n")
    print("vectorization:", result)


if __name__ == "__main__":
    sys.exit(main())
