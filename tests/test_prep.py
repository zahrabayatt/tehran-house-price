from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from training import prep
from training.prep import clean, clean_with_coords

OUTPUT_COLUMNS = ["area", "rooms", "age", "parking", "elevator", "storage",
                  "neighborhood", "month", "price", "price_per_m2"]


def row(**kw):
    base = dict(
        city_slug="tehran", cat3_slug="apartment-sell", price_mode="مقطوع",
        price_value=8.5e9, building_size=100.0, rooms_count="دو",
        construction_year="۱۴۰۰", has_parking=True, has_elevator=True,
        has_warehouse=False, neighborhood_slug="poonak",
        created_at_month="2024-06-01 00:00:00",
        location_latitude=35.7, location_longitude=51.4,
    )
    base.update(kw)
    return base


def frame(*rows):
    return pd.DataFrame(list(rows))


def run(df, low=12, high=600):
    return clean(df, low, high)


def test_output_columns_and_units():
    out, _ = run(frame(row()))
    assert list(out.columns) == OUTPUT_COLUMNS
    r = out.iloc[0]
    assert r["price"] == pytest.approx(8.5)  # billion toman
    assert r["price_per_m2"] == pytest.approx(85.0)  # million toman per m2
    assert r["area"] == 100
    assert r["rooms"] == 2
    assert r["age"] == 3  # 1403 - 1400
    assert (r["parking"], r["elevator"], r["storage"]) == (1, 1, 0)
    assert r["month"] == "2024-06"
    assert r["neighborhood"] == "poonak"


def test_no_title_description_or_coordinate_columns():
    df = frame(row(), row(price_value=9e9))
    df["title"] = "x"
    df["description"] = "y"
    out, _ = run(df)
    for bad in ("title", "description", "lat", "lon", "location_latitude",
                "location_longitude"):
        assert bad not in out.columns


def test_clean_with_coords_keeps_lat_lon_only_here():
    df = frame(row(), row(price_value=9e9, location_latitude=np.nan,
                          location_longitude=np.nan))
    plain, steps_a = clean(df, 12, 600)
    coords, steps_b = clean_with_coords(df, 12, 600)
    assert "lat" not in plain.columns and "lon" not in plain.columns
    assert list(coords.columns) == OUTPUT_COLUMNS + ["lat", "lon"]
    assert steps_a == steps_b
    assert coords.loc[0, "lat"] == 35.7 and coords.loc[0, "lon"] == 51.4
    assert np.isnan(coords.loc[1, "lat"])
    pd.testing.assert_frame_equal(plain, coords[OUTPUT_COLUMNS])


def test_exact_duplicates_removed():
    out, steps = run(frame(row(), row(), row(price_value=9e9)))
    assert len(out) == 2
    dup = next(s for s in steps if "duplicate" in s["label"].lower())
    assert dup["removed"] == 1


def test_rows_differing_only_in_coordinates_are_not_duplicates():
    out, _ = run(frame(row(), row(location_latitude=35.8)))
    assert len(out) == 2


def test_window_filter():
    df = frame(
        row(created_at_month="2024-04-01 00:00:00"),
        row(created_at_month="2024-05-01 00:00:00", price_value=7e9),
        row(created_at_month="2024-12-01 00:00:00", price_value=7.1e9),
        row(created_at_month="2025-01-01 00:00:00", price_value=7.2e9),
    )
    out, _ = run(df)
    assert sorted(out["month"]) == ["2024-05", "2024-12"]
    assert prep.WINDOW_START == "2024-05" and prep.WINDOW_END == "2024-12"


def test_price_per_m2_outside_bounds_removed_inside_kept():
    df = frame(
        row(price_value=100 * 11.9e6),   # 11.9 million per m2, below 12
        row(price_value=100 * 12e6),     # 12, kept (inclusive)
        row(price_value=100 * 600e6),    # 600, kept (inclusive)
        row(price_value=100 * 601e6),    # above
        row(price_value=1.0),            # raw junk price
        row(price_value=9e13),           # raw junk price
    )
    out, _ = run(df)
    assert sorted(out["price_per_m2"].round(6)) == [12.0, 600.0]


def test_area_outside_bounds_removed():
    df = frame(
        row(building_size=9_999_999.0, price_value=9e13),
        row(building_size=24.0, price_value=24 * 50e6),
        row(building_size=25.0, price_value=25 * 50e6),
        row(building_size=600.0, price_value=600 * 50e6),
        row(building_size=601.0, price_value=601 * 50e6),
    )
    out, _ = run(df)
    assert sorted(out["area"]) == [25, 600]


def test_expensive_legit_apartment_kept():
    out, _ = run(frame(row(price_value=2.4e11, building_size=400.0,
                           neighborhood_slug="elahiyeh")))
    assert len(out) == 1
    assert out.iloc[0]["price_per_m2"] == pytest.approx(600.0)


def test_missing_neighborhood_kept_as_none():
    out, _ = run(frame(row(neighborhood_slug=None),
                       row(neighborhood_slug="", price_value=9e9),
                       row(neighborhood_slug=np.nan, price_value=9.1e9)))
    assert len(out) == 3
    assert all(v is None for v in out["neighborhood"])


@pytest.mark.parametrize("field,value", [
    ("price_value", np.nan), ("price_value", 0.0), ("price_value", -5.0),
    ("building_size", np.nan), ("rooms_count", None), ("rooms_count", "نامعلوم"),
    ("construction_year", None), ("construction_year", "xyz"),
    ("construction_year", "۱۴۱۰"),
    ("has_parking", None), ("has_elevator", None), ("has_warehouse", None),
])
def test_missing_or_invalid_required_field_dropped(field, value):
    bad = row(**{field: value})
    if field != "price_value":
        bad["price_value"] = 9e9  # avoid being an exact duplicate of the good row
    out, _ = run(frame(row(), bad))
    assert len(out) == 1


def test_persian_values_parsed_not_dropped():
    out, _ = run(frame(
        row(rooms_count="پنج یا بیشتر", construction_year="قبل از ۱۳۷۰"),
        row(rooms_count="بدون اتاق", construction_year="۱۴۰۳", price_value=9e9),
    ))
    assert len(out) == 2
    assert list(out["rooms"]) == [5, 0]
    assert list(out["age"]) == [34, 0]


def test_dtypes():
    out, _ = run(frame(row()))
    for col in ("rooms", "age", "parking", "elevator", "storage"):
        assert pd.api.types.is_integer_dtype(out[col]), col
    assert not out[["area", "price", "price_per_m2"]].isna().any().any()


def test_steps_start_at_input_and_never_increase():
    df = frame(
        row(), row(),                                  # duplicate
        row(created_at_month="2023-01-01 00:00:00", price_value=7e9),
        row(rooms_count=None, price_value=7.1e9),
        row(building_size=5.0, price_value=5 * 50e6),
        row(price_value=1.0),
        row(price_value=8e9),
    )
    out, steps = run(df)
    rows = [s["rows"] for s in steps]
    assert rows[0] == len(df)
    assert rows[-1] == len(out)
    assert all(a >= b for a, b in zip(rows, rows[1:]))
    # each step records what it removed, and removals sum to the total drop
    assert all(s["removed"] == prev["rows"] - s["rows"]
               for prev, s in zip(steps, steps[1:]))
    assert sum(s["removed"] for s in steps[1:]) == len(df) - len(out)
    assert all(set(s) >= {"label", "rows"} for s in steps)


def test_index_is_reset():
    out, _ = run(frame(row(created_at_month="2023-01-01 00:00:00"),
                       row(price_value=9e9)))
    assert list(out.index) == [0]


def test_input_not_mutated():
    df = frame(row(), row())
    before = df.copy()
    run(df)
    pd.testing.assert_frame_equal(df, before)


def test_empty_result_is_well_formed():
    out, steps = run(frame(row(price_value=1.0)))
    assert len(out) == 0
    assert list(out.columns) == OUTPUT_COLUMNS
    assert steps[-1]["rows"] == 0


def test_datetime_month_column_accepted():
    df = frame(row())
    df["created_at_month"] = pd.to_datetime(df["created_at_month"])
    out, _ = run(df)
    assert list(out["month"]) == ["2024-06"]


def test_run_clean_funnel_starts_with_prior_counts():
    if not (Path(prep.RAW) / "tehran_apartment_sell.parquet").exists():
        pytest.skip("raw data not downloaded")
    out, steps = prep.run_clean()
    assert steps[0]["rows"] == 1_000_000
    assert steps[1]["rows"] == 190_904
    assert steps[2]["rows"] == 84_586
    assert steps[3]["rows"] == 84_584
    rows = [s["rows"] for s in steps]
    assert all(a >= b for a, b in zip(rows, rows[1:]))
    assert rows[-1] == len(out)
    assert list(out.columns) == OUTPUT_COLUMNS
