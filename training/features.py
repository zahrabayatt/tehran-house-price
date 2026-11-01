"""Features and the time split, built so nothing from held-out data leaks in.

The location feature is the one derived from data: for each neighborhood, the
median price per m2 (million toman) over TRAINING rows only. A neighborhood
with fewer than `min_rows` training rows, a blank one, or one never seen in
training uses the Tehran-wide training median instead. The feature is in
billions of toman: area * median_price_per_m2 / 1000.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

BASE_FEATURES = ("area", "rooms", "age", "parking", "elevator", "storage")


def zscore_fit(X) -> tuple[np.ndarray, np.ndarray]:
    """Per-column mean and standard deviation. A constant column gets sigma = 1."""
    X = np.asarray(X, dtype=float)
    if X.ndim == 1:
        X = X.reshape(-1, 1)
    mu = X.mean(axis=0)
    sigma = X.std(axis=0)
    sigma = np.where(sigma > 0, sigma, 1.0)
    return mu, sigma


def zscore_apply(X, mu, sigma) -> np.ndarray:
    """(X - mu) / sigma, with any zero sigma treated as 1."""
    X = np.asarray(X, dtype=float)
    sigma = np.asarray(sigma, dtype=float)
    sigma = np.where(sigma > 0, sigma, 1.0)
    return (X - mu) / sigma


def location_lookup(train: pd.DataFrame, min_rows: int = 30
                    ) -> tuple[dict[str, float], float]:
    """Median price_per_m2 per neighborhood, and the Tehran fallback median.

    Only neighborhoods with at least `min_rows` rows in `train` get an entry.
    The fallback is the median over every row of `train`.
    """
    fallback = float(train["price_per_m2"].median())
    known = train[train["neighborhood"].notna()]
    grouped = known.groupby("neighborhood")["price_per_m2"]
    medians = grouped.median()
    counts = grouped.size()
    lookup = {str(k): float(medians[k]) for k in medians.index
              if counts[k] >= min_rows}
    return lookup, fallback


def location_feature(df: pd.DataFrame, lookup: dict[str, float],
                     fallback: float) -> np.ndarray:
    """area * median_price_per_m2 / 1000, in billions of toman."""
    ppm2 = np.array([lookup.get(n, fallback) if isinstance(n, str) else fallback
                     for n in df["neighborhood"]], dtype=float)
    return df["area"].to_numpy(dtype=float) * ppm2 / 1000.0


def _column(df: pd.DataFrame, base: str, lookup, fallback) -> np.ndarray:
    if base == "location":
        return location_feature(df, lookup, fallback)
    if base in BASE_FEATURES:
        return df[base].to_numpy(dtype=float)
    raise ValueError(f"unknown feature {base!r}")


def build_matrix(df: pd.DataFrame, lookup: dict[str, float], fallback: float,
                 feature_names) -> np.ndarray:
    """Columns in the order of `feature_names`.

    A name is a base feature (area, rooms, age, parking, elevator, storage,
    location) or a power such as "location^2" or "area^2".
    """
    cols = []
    for name in feature_names:
        base, sep, power = name.partition("^")
        col = _column(df, base, lookup, fallback)
        if sep:
            try:
                p = int(power)
            except ValueError:
                raise ValueError(f"bad power in feature {name!r}") from None
            if p < 1:
                raise ValueError(f"bad power in feature {name!r}")
            col = col ** p
        cols.append(col)
    if not cols:
        return np.empty((len(df), 0))
    return np.column_stack(cols)


def split_by_month(df: pd.DataFrame
                   ) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """(train, selection, held_out) by month.

    The last two months are held out, the month before them is the selection
    set, everything earlier is training. Needs at least four distinct months.
    """
    months = sorted(df["month"].dropna().unique())
    if len(months) < 4:
        raise ValueError(f"need at least 4 months to split, found {len(months)}")
    held_months, sel_month = months[-2:], months[-3]
    m = df["month"]
    held = df[m.isin(held_months)]
    sel = df[m == sel_month]
    train = df[m < sel_month]
    return train, sel, held
