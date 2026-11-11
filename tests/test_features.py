import numpy as np
import pandas as pd
import pytest

from training.features import (build_matrix, location_feature, location_lookup,
                               split_by_month, zscore_apply, zscore_fit)


def frame(neigh, ppm2, area=100.0, month="2024-06"):
    n = len(ppm2)
    return pd.DataFrame({
        "area": [area] * n, "rooms": [2] * n, "age": [5] * n,
        "parking": [1] * n, "elevator": [1] * n, "storage": [0] * n,
        "neighborhood": neigh, "month": [month] * n,
        "price": [area * p / 1000 for p in ppm2],
        "price_per_m2": ppm2,
    })


def test_median_ignores_held_out():
    months = [f"2024-{m:02d}" for m in range(5, 13)]
    df = pd.concat([frame(["a"] * 30, [10.0 + i for i in range(30)], month=m)
                    for m in months], ignore_index=True)
    train, _, held = split_by_month(df)
    before = location_lookup(train)
    df.loc[df["month"].isin(["2024-11", "2024-12"]), "price_per_m2"] = 99999.0
    train2, _, held2 = split_by_month(df)
    assert (held2["price_per_m2"] == 99999.0).all()
    assert location_lookup(train2) == before


def test_small_neighborhood_uses_fallback():
    train = pd.concat([frame(["a"] * 29, [100.0] * 29),
                       frame(["b"] * 30, [40.0] * 30)], ignore_index=True)
    lookup, fallback = location_lookup(train)
    assert "a" not in lookup and lookup["b"] == 40.0
    q = frame(["a", "b"], [0.0, 0.0])
    feat = location_feature(q, lookup, fallback)
    assert feat[0] == pytest.approx(100.0 * fallback / 1000)
    assert feat[1] == pytest.approx(100.0 * 40.0 / 1000)
    assert location_lookup(frame(["a"] * 30, [100.0] * 30))[0]["a"] == 100.0


def test_unknown_neighborhood_is_finite():
    train = frame(["a"] * 30, [60.0] * 30)
    lookup, fallback = location_lookup(train)
    q = frame(["zzz", None], [0.0, 0.0])
    feat = location_feature(q, lookup, fallback)
    assert np.isfinite(feat).all()
    assert np.allclose(feat, 100.0 * 60.0 / 1000)
    X = build_matrix(q, lookup, fallback, ["area", "location", "location^2"])
    assert np.isfinite(X).all()


def test_blank_neighborhoods_in_train_do_not_break_lookup():
    lookup, fallback = location_lookup(frame([None] * 40, [30.0] * 40))
    assert lookup == {} and fallback == 30.0


def test_zero_sigma_does_not_divide_by_zero():
    X = np.array([[1.0, 5.0], [2.0, 5.0], [3.0, 5.0]])
    mu, sigma = zscore_fit(X)
    assert sigma[1] == 1.0
    Z = zscore_apply(X, mu, sigma)
    assert np.isfinite(Z).all()
    assert np.allclose(Z[:, 1], 0.0)
    assert np.allclose(zscore_apply(X, mu, np.array([1.0, 0.0]))[:, 1], 0.0)


def test_build_matrix_order_and_powers():
    df = frame(["a"] * 2, [50.0, 50.0], area=80.0)
    X = build_matrix(df, {"a": 50.0}, 50.0,
                     ["location^2", "area", "rooms", "area^2"])
    assert X.shape == (2, 4)
    assert X[0, 0] == pytest.approx(4.0 ** 2)
    assert X[0, 1] == 80.0 and X[0, 2] == 2.0 and X[0, 3] == 6400.0
    with pytest.raises(ValueError):
        build_matrix(df, {}, 1.0, ["bogus"])


def test_log_features_take_the_log_before_the_power():
    df = frame(["a"] * 2, [50.0, 50.0], area=80.0)
    X = build_matrix(df, {"a": 50.0}, 50.0, ["log(area)", "log(location)", "log(area)^2"])
    assert X[0, 0] == pytest.approx(np.log(80.0))
    assert X[0, 1] == pytest.approx(np.log(80.0 * 50.0 / 1000))
    assert X[0, 2] == pytest.approx(np.log(80.0) ** 2)


def test_feature_names_parse_and_bad_ones_are_refused():
    from training.features import feature_base, parse_feature
    assert parse_feature("log(area)^2") == ("area", True, 2)
    assert parse_feature("location") == ("location", False, 1)
    assert feature_base("log(location)") == "location"
    df = frame(["a"] * 2, [50.0, 50.0], area=80.0)
    for bad in ["log(bogus)", "log(area", "area^0", "area^x", "log()"]:
        with pytest.raises(ValueError):
            build_matrix(df, {"a": 50.0}, 50.0, [bad])


def test_log_of_zero_is_refused():
    df = frame(["a"] * 2, [50.0, 50.0], area=80.0).assign(age=[0, 3])
    with pytest.raises(ValueError, match="at or below zero"):
        build_matrix(df, {"a": 50.0}, 50.0, ["log(age)"])


def test_split_order():
    months = [f"2024-{m:02d}" for m in range(5, 13)]
    df = pd.concat([frame(["a"] * 3, [1.0] * 3, month=m) for m in months],
                   ignore_index=True)
    train, sel, held = split_by_month(df)
    assert train["month"].max() < sel["month"].min()
    assert sel["month"].max() < held["month"].min()
    assert sorted(held["month"].unique()) == ["2024-11", "2024-12"]
    assert sorted(sel["month"].unique()) == ["2024-10"]
    assert sorted(train["month"].unique()) == months[:5]
    assert len(train) + len(sel) + len(held) == len(df)
    with pytest.raises(ValueError):
        split_by_month(df[df["month"] < "2024-08"])


def test_threshold_counts_real_prices_not_rows():
    """30 rows with one missing price are 29 usable rows, so fallback."""
    prices = [50.0] * 29 + [np.nan]
    train = pd.concat([frame(["a"] * 30, prices),
                       frame(["b"] * 30, [40.0] * 30)], ignore_index=True)
    lookup, _ = location_lookup(train)
    assert "a" not in lookup
    assert lookup["b"] == 40.0


def test_fallback_is_median_of_all_training_prices():
    """Uneven prices tell apart the median of all rows from every near miss."""
    train = pd.concat([
        frame(["big"] * 36, [10.0] * 36),
        frame(["small"] * 36, [100.0] * 36),
        frame(["rare"] * 3, [1000.0] * 3),      # below min_rows, still counted
        frame([None] * 2, [2000.0] * 2),        # blank neighborhood, still counted
    ], ignore_index=True)
    lookup, fallback = location_lookup(train)
    assert set(lookup) == {"big", "small"}
    assert fallback == train["price_per_m2"].median() == 100.0
    assert fallback != pytest.approx(train["price_per_m2"].mean())
    assert fallback != pytest.approx(np.median(list(lookup.values())))  # 55.0
    in_lookup = train[train["neighborhood"].isin(lookup)]
    assert in_lookup["price_per_m2"].median() == 55.0  # would differ if rows were skipped
