"""Linear regression with gradient descent, written with NumPy only.

Model:        f(x) = w . x + b
Cost:         J = 1/(2m) * sum((f(x_i) - y_i)^2)  +  lambda/(2m) * sum(w_j^2)
Gradient:     dJ/dw = 1/m * X^T e + lambda/m * w,   dJ/db = mean(e),   e = f(X) - y

The bias b is never penalized. Shapes: X is (m, n), y is (m,), w is (n,), b is
a scalar. The vectorized functions are the production code. The blocks between
`# lab:<name>` and `# endlab` are what the Lab page shows line by line: plain
loop versions for teaching, plus the descent loop itself.
"""
from __future__ import annotations

import numpy as np


def predict(X, w, b) -> np.ndarray:
    """Predictions for every row of X."""
    return np.asarray(X, dtype=float) @ np.asarray(w, dtype=float) + b


def compute_cost(X, y, w, b, lambda_: float = 0.0) -> float:
    """Squared-error cost, with an optional L2 penalty on w (not on b)."""
    X = np.asarray(X, dtype=float)
    y = np.asarray(y, dtype=float)
    w = np.asarray(w, dtype=float)
    m = X.shape[0]
    e = X @ w + b - y
    return float(e @ e / (2 * m) + lambda_ / (2 * m) * (w @ w))


def compute_gradient(X, y, w, b, lambda_: float = 0.0) -> tuple[np.ndarray, float]:
    """Gradient of compute_cost with respect to w and b."""
    X = np.asarray(X, dtype=float)
    y = np.asarray(y, dtype=float)
    w = np.asarray(w, dtype=float)
    m = X.shape[0]
    e = X @ w + b - y
    dj_dw = X.T @ e / m + lambda_ / m * w
    dj_db = float(np.mean(e))
    return dj_dw, dj_db


# lab:predict_loop
def predict_loop(X, w, b):
    m, n = X.shape
    p = np.zeros(m)
    for i in range(m):
        total = 0.0
        for j in range(n):
            total += X[i, j] * w[j]
        p[i] = total + b
    return p
# endlab


# lab:compute_cost_loop
def compute_cost_loop(X, y, w, b):
    m, n = X.shape
    total = 0.0
    for i in range(m):
        f_i = b
        for j in range(n):
            f_i += X[i, j] * w[j]
        total += (f_i - y[i]) ** 2
    return total / (2 * m)
# endlab


# lab:compute_gradient_loop
def compute_gradient_loop(X, y, w, b):
    m, n = X.shape
    dj_dw = np.zeros(n)
    dj_db = 0.0
    for i in range(m):
        f_i = b
        for j in range(n):
            f_i += X[i, j] * w[j]
        err = f_i - y[i]
        for j in range(n):
            dj_dw[j] += err * X[i, j]
        dj_db += err
    return dj_dw / m, dj_db / m
# endlab


# lab:compute_cost_reg
def compute_cost_reg(X, y, w, b, lambda_):
    m, n = X.shape
    cost = compute_cost_loop(X, y, w, b)
    penalty = 0.0
    for j in range(n):
        penalty += w[j] ** 2
    return cost + lambda_ / (2 * m) * penalty
# endlab


# lab:compute_gradient_reg
def compute_gradient_reg(X, y, w, b, lambda_):
    m, n = X.shape
    dj_dw, dj_db = compute_gradient_loop(X, y, w, b)
    for j in range(n):
        dj_dw[j] += lambda_ / m * w[j]
    return dj_dw, dj_db
# endlab


# lab:gradient_descent
def gradient_descent(X, y, w, b, alpha, num_iters, lambda_=0.0):
    """Batch gradient descent. Returns (w, b, J_history).

    J_history[i] is the cost after update i + 1. If the cost ever stops being
    finite (alpha too large), descent stops at once: the result is the last
    finite (w, b), and J_history holds only finite costs, so
    len(J_history) < num_iters means it diverged on update len(J_history) + 1.
    The inputs are never modified.
    """
    w = np.array(w, dtype=float)
    b = float(b)
    J_history = []
    with np.errstate(all="ignore"):
        for _ in range(num_iters):
            dj_dw, dj_db = compute_gradient(X, y, w, b, lambda_)
            w_new = w - alpha * dj_dw
            b_new = b - alpha * dj_db
            cost = compute_cost(X, y, w_new, b_new, lambda_)
            if not np.isfinite(cost):
                break
            w, b = w_new, b_new
            J_history.append(cost)
    return w, b, J_history
# endlab
