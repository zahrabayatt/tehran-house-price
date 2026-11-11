"""Features and the time split, built so nothing from held-out data leaks in.

The location feature is the one derived from data: for each neighborhood, the
median price per m2 (million toman) over TRAINING rows only. A neighborhood
with fewer than `min_rows` training rows, a blank one, or one never seen in
training uses the Tehran-wide training median instead. The feature is in
billions of toman: area * median_price_per_m2 / 1000.

A feature name is a base feature, optionally inside log(...), optionally raised
to a power: "area", "location^2", "log(area)", "log(location)^2". The log is
applied first, then the power.
"""
from __future__ import annotations

import re

import numpy as np
import pandas as pd

BASE_FEATURES = ("area", "rooms", "age", "parking", "elevator", "storage")


# lab:zscore
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
# endlab


# lab:location_lookup
def location_lookup(train: pd.DataFrame, min_rows: int = 30
                    ) -> tuple[dict[str, float], float]:
    """Median price_per_m2 per neighborhood, and the Tehran fallback median.

    Only neighborhoods with at least `min_rows` rows in `train` get an entry.
    The fallback is the median over every training price, including rows whose
    neighborhood is blank or too small for its own entry.
    """
    fallback = float(train["price_per_m2"].median())
    known = train[train["neighborhood"].notna()]
    grouped = known.groupby("neighborhood")["price_per_m2"]
    medians = grouped.median()
    counts = grouped.count()  # rows with a usable price, not all rows
    lookup = {str(k): float(medians[k]) for k in medians.index
              if counts[k] >= min_rows}
    return lookup, fallback
# endlab


# lab:location_feature
def location_feature(df: pd.DataFrame, lookup: dict[str, float],
                     fallback: float) -> np.ndarray:
    """area * median_price_per_m2 / 1000, in billions of toman."""
    ppm2 = np.array([lookup.get(n, fallback) if isinstance(n, str) else fallback
                     for n in df["neighborhood"]], dtype=float)
    return df["area"].to_numpy(dtype=float) * ppm2 / 1000.0
# endlab


def _column(df: pd.DataFrame, base: str, lookup, fallback) -> np.ndarray:
    if base == "location":
        return location_feature(df, lookup, fallback)
    if base in BASE_FEATURES:
        return df[base].to_numpy(dtype=float)
    raise ValueError(f"unknown feature {base!r}")


_NAME = re.compile(r"^(?:log\((?P<logged>\w+)\)|(?P<plain>\w+))(?:\^(?P<power>.*))?$")


def parse_feature(name: str) -> tuple[str, bool, int]:
    """(base, logged, power) for a name such as "log(area)^2" -> ("area", True, 2)."""
    m = _NAME.match(name)
    if not m:
        raise ValueError(f"unknown feature {name!r}")
    base = m["logged"] or m["plain"]
    power = 1
    if m["power"] is not None:
        try:
            power = int(m["power"])
        except ValueError:
            raise ValueError(f"bad power in feature {name!r}") from None
        if power < 1:
            raise ValueError(f"bad power in feature {name!r}")
    return base, m["logged"] is not None, power


def feature_base(name: str) -> str:
    """The data column a feature is built from: "log(area)^2" -> "area"."""
    return parse_feature(name)[0]


def build_matrix(df: pd.DataFrame, lookup: dict[str, float], fallback: float,
                 feature_names) -> np.ndarray:
    """Columns in the order of `feature_names` (see the module note for the name syntax)."""
    cols = []
    for name in feature_names:
        base, logged, power = parse_feature(name)
        col = _column(df, base, lookup, fallback)
        if logged:
            if (col <= 0).any():
                raise ValueError(f"log of a value at or below zero in feature {name!r}")
            col = np.log(col)
        if power != 1:
            col = col ** power
        cols.append(col)
    if not cols:
        return np.empty((len(df), 0))
    return np.column_stack(cols)


# lab:split_by_month
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
# endlab
