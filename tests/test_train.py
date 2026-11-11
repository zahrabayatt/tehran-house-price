import json
import math
import re
import types
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from training import train as T
from training.features import location_lookup, split_by_month, zscore_fit, build_matrix

ROOT = Path(__file__).resolve().parent.parent
MODEL = ROOT / "model" / "model.json"
DATA = ROOT / "web" / "public" / "data"
RAW = ROOT / "data" / "raw" / "tehran_apartment_sell.parquet"
FORBIDDEN = {"lat", "lon", "latitude", "longitude", "location_latitude",
             "location_longitude", "title", "description", "user", "user_id",
             "phone", "x", "y"}
MODEL_KEYS = {"version", "features", "weights", "bias", "scaling", "location",
              "hyperparameters", "cost", "sklearn_cost", "cost_history", "rows",
              "date_range", "unit", "trained_at", "runtime_ms", "environment",
              "candidates", "held_out_gap", "target", "cost_billions", "previous_version"}
MONTHS = [f"2024-{m:02d}" for m in range(5, 13)]
SMALL = [(("location",), 0.0), (("location", "age"), 0.0),
         (("location", "age"), 100.0), (("area",), 0.0)]


def synthetic(rows_per_month=120, seed=7):
    """Eight months, three neighborhoods with distinct price levels."""
    rng = np.random.default_rng(seed)
    parts = []
    levels = {"cheap-town": 40.0, "mid-town": 80.0, "top-hill": 200.0}
    for month in MONTHS:
        n = rows_per_month
        hood = rng.choice(list(levels), n)
        area = rng.uniform(40, 200, n)
        age = rng.integers(0, 30, n)
        ppm2 = np.array([levels[h] for h in hood]) * rng.uniform(0.9, 1.1, n) - 0.2 * age
        parts.append(pd.DataFrame({
            "area": area, "rooms": rng.integers(1, 4, n), "age": age,
            "parking": rng.integers(0, 2, n), "elevator": rng.integers(0, 2, n),
            "storage": rng.integers(0, 2, n), "neighborhood": hood,
            "month": month, "price": area * ppm2 / 1000, "price_per_m2": ppm2,
        }))
    return pd.concat(parts, ignore_index=True)


def run_small(df=None, **kw):
    df = synthetic() if df is None else df
    return T.train_model(df, candidates=SMALL, alpha=0.3, iterations=400, **kw)


def walk_numbers(node):
    if isinstance(node, bool) or node is None or isinstance(node, str):
        return
    if isinstance(node, (int, float)):
        yield node
    elif isinstance(node, dict):
        for v in node.values():
            yield from walk_numbers(v)
    else:
        for v in node:
            yield from walk_numbers(v)


def walk_keys(node):
    if isinstance(node, dict):
        for k, v in node.items():
            yield k
            yield from walk_keys(v)
    elif isinstance(node, list):
        for v in node:
            yield from walk_keys(v)


def load(name):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


# --- choosing without touching held-out data -----------------------------------

def test_held_out_is_evaluated_once_and_after_selection(monkeypatch):
    calls = []
    real_select, real_held, real_sk = (T.select_candidate, T.evaluate_held_out,
                                       T.sklearn_costs)

    def select(*a, **k):
        calls.append("select")
        return real_select(*a, **k)

    def held(*a, **k):
        calls.append("held_out")
        return real_held(*a, **k)

    def sk(*a, **k):
        calls.append("sklearn")
        return real_sk(*a, **k)

    monkeypatch.setattr(T, "select_candidate", select)
    monkeypatch.setattr(T, "evaluate_held_out", held)
    monkeypatch.setattr(T, "sklearn_costs", sk)
    run_small()
    assert calls.count("select") == 1 and calls.count("held_out") == 1
    assert calls.index("select") < calls.index("held_out")
    assert calls.index("select") < calls.index("sklearn")


def test_changing_held_out_prices_changes_only_held_out_results():
    base = synthetic()
    changed = base.copy()
    mask = changed["month"].isin(["2024-11", "2024-12"])
    changed.loc[mask, "price"] = changed.loc[mask, "price"] * 7 + 3
    changed.loc[mask, "price_per_m2"] = changed.loc[mask, "price_per_m2"] * 7 + 3
    a, b = run_small(base)["model"], run_small(changed)["model"]
    for key in ("features", "weights", "bias", "scaling", "location", "hyperparameters",
                "candidates", "cost_history"):
        assert a[key] == b[key], key
    assert a["cost"]["selection"] == b["cost"]["selection"]
    assert a["cost"]["held_out"] != b["cost"]["held_out"]


def test_select_candidate_cannot_see_held_out():
    import inspect
    names = set(inspect.signature(T.select_candidate).parameters)
    assert "train" in names and "selection" in names
    assert not any("held" in n for n in names)


def test_winner_has_lowest_selection_cost_among_all_candidates():
    m = run_small()["model"]
    assert len(m["candidates"]) == len(SMALL)
    assert {tuple(c["features"]) for c in m["candidates"]} == {tuple(f) for f, _ in SMALL}
    for c in m["candidates"]:
        assert {"features", "lambda", "selection_cost", "train_cost"} <= set(c)
    best = min(m["candidates"], key=lambda c: c["selection_cost"])
    assert m["features"] == best["features"]
    assert m["hyperparameters"]["lambda"] == best["lambda"]
    assert m["cost"]["selection"] == pytest.approx(best["selection_cost"])
    assert best["chosen"] is True
    assert sum(1 for c in m["candidates"] if c["chosen"]) == 1


def test_selection_cost_has_no_penalty():
    """A large lambda must not be charged its penalty when compared."""
    df = synthetic()
    train, sel, _ = split_by_month(df)
    records, _, _, _ = T.select_candidate(train, sel, [(("location",), 100.0)], 0.3, 300)
    fit = T.fit_candidate(train, ("location",), 100.0, 0.3, 300)
    pred = T.predict_fit(fit, sel)
    plain = float(np.mean((np.log(pred) - np.log(sel["price"].to_numpy())) ** 2) / 2)
    assert records[0]["selection_cost"] == pytest.approx(plain)


def test_the_model_learns_log_price_and_predicts_in_billions():
    df = synthetic()
    train, sel, _ = split_by_month(df)
    fit = T.fit_candidate(train, ("log(location)", "age"), 0.0, 0.3, 3000)
    pred = T.predict_fit(fit, sel)
    assert (pred > 0).all()
    # The synthetic price is area * ppm2 / 1000, so log(location) explains it almost exactly.
    share = np.abs(pred - sel["price"].to_numpy()) / sel["price"].to_numpy()
    assert np.median(share) < 0.06
    assert np.allclose(np.log(pred), T.predict_log(fit, sel))


def test_cost_in_billions_is_the_version_1_cost():
    assert T.cost_in_billions([1.0, 3.0], [2.0, 1.0]) == pytest.approx((1 + 4) / 4)


def test_diverged_candidate_cannot_win():
    df = synthetic()
    train, sel, _ = split_by_month(df)
    records, best, _, _ = T.select_candidate(train, sel, SMALL[:2], 50.0, 200)
    assert all(r["diverged"] for r in records) and best is None
    with pytest.raises(ValueError):
        T.train_model(df, candidates=SMALL[:2], alpha=50.0, iterations=200)


def test_scaling_and_lookup_come_from_training_rows_only():
    df = synthetic()
    m = run_small(df)["model"]
    train, _, _ = split_by_month(df)
    lookup, fallback = location_lookup(train)
    assert m["location"]["lookup"] == lookup
    assert m["location"]["fallback"] == fallback
    X = build_matrix(train, lookup, fallback, m["features"])
    mu, sigma = zscore_fit(X)
    assert m["scaling"]["mu"] == pytest.approx(mu.tolist())
    assert m["scaling"]["sigma"] == pytest.approx(sigma.tolist())


def test_engineered_powers_are_scaled_and_trained_like_any_column():
    df = synthetic()
    res = T.train_model(df, candidates=[(("location", "location^2"), 0.0)],
                        alpha=0.3, iterations=2000)
    m = res["model"]
    assert m["features"] == ["location", "location^2"]
    assert len(m["weights"]) == 2 and all(s > 0 for s in m["scaling"]["sigma"])


def test_runtime_is_measured_with_perf_counter(monkeypatch):
    ticks = iter(range(0, 100000, 2))
    fake = types.SimpleNamespace(perf_counter=lambda: float(next(ticks)))
    monkeypatch.setattr(T, "time", fake)
    assert run_small()["model"]["runtime_ms"] == 2000.0


def test_final_training_reproduces_the_candidate_that_won():
    res = run_small()
    m, df = res["model"], synthetic()
    train, sel, _ = split_by_month(df)
    fit = T.fit_candidate(train, tuple(m["features"]), m["hyperparameters"]["lambda"],
                          0.3, 400)
    assert m["weights"] == fit["w"].tolist() and m["bias"] == fit["b"]
    assert m["hyperparameters"]["iterations"] == 400
    assert m["hyperparameters"]["alpha"] == 0.3


def test_sklearn_cost_is_reported_and_close_to_descent():
    res = T.train_model(synthetic(), candidates=[(("location", "age"), 0.0)],
                        alpha=0.3, iterations=4000)
    m = res["model"]
    assert set(m["sklearn_cost"]) == {"linear_regression"}
    assert m["sklearn_cost"]["linear_regression"] == pytest.approx(m["cost"]["held_out"], rel=1e-3)
    res = T.train_model(synthetic(), candidates=[(("location", "age"), 500.0)],
                        alpha=0.3, iterations=4000)
    m = res["model"]
    assert set(m["sklearn_cost"]) == {"linear_regression", "ridge"}
    assert m["sklearn_cost"]["ridge"] == pytest.approx(m["cost"]["held_out"], rel=1e-3)


def test_predict_from_model_is_self_contained():
    res = run_small()
    m = res["model"]
    _, _, held = split_by_month(synthetic())
    pred = T.predict_from_model(m, held)
    y = held["price"].to_numpy()
    assert float(np.mean((pred - y) ** 2) / 2) == pytest.approx(m["cost_billions"]["held_out"])
    assert float(np.mean((np.log(pred) - np.log(y)) ** 2) / 2) == pytest.approx(m["cost"]["held_out"])
    unknown = held.head(2).assign(neighborhood=["nowhere", None])
    assert np.isfinite(T.predict_from_model(m, unknown)).all()


def test_cost_history_is_downsampled_with_its_update_numbers():
    m = run_small()["model"]
    its, hist = m["cost_history_iterations"], m["cost_history"]
    assert len(its) == len(hist) <= T.HISTORY_POINTS
    assert its[0] == 1 and its[-1] == 400 and its == sorted(set(its))
    assert hist[-1] <= hist[0]


# --- plain-language gap --------------------------------------------------------

def test_plain_gap():
    y = np.array([1.0, 2.0, 4.0, 10.0, 20.0])
    p = np.array([2.0, 2.0, 3.0, 12.0, 10.0])
    g = T.plain_gap(y, p)
    assert g["median_billions"] == 1.0             # 1, 0, 1, 2, 10
    assert g["median_share_of_price"] == 0.25      # 1, 0, .25, .2, .5 -> .25
    assert not any(re.search(r"mse|rmse|mae|l1|l2", k, re.I) for k in g)


# --- exports -------------------------------------------------------------------

def test_label_title_cases_slug():
    assert T.label("saadat-abad") == "Saadat Abad"
    assert T.label("niavaran") == "Niavaran"
    assert T.label(None) == "Unknown"


def test_listing_pick_uses_seed_and_ignores_errors():
    df = synthetic()
    _, _, held = split_by_month(df)
    a = T.pick_listings(held)
    assert len(a) == T.LISTING_COUNT
    changed = held.assign(price=held["price"] * 50)
    assert a.index.tolist() == T.pick_listings(changed).index.tolist()
    expected = np.random.default_rng(42).choice(len(held), T.LISTING_COUNT, replace=False)
    assert a.index.tolist() == held.index[np.sort(expected)].tolist()


def test_listing_fields_and_difference_sign():
    from training.site_data import build_listings
    res = run_small()
    rows = build_listings(res["held_out"], res["held_pred"], {"top-hill": "Top Hill Official"})
    assert all(set(r) == T.LISTING_FIELDS for r in rows)
    for r in rows:
        assert r["difference"] == pytest.approx(round(r["model"] - r["asked"], 2))
    # An official name when the Divar neighborhood has one, the Divar name otherwise.
    assert {r["neighborhood"] for r in rows} <= {"Cheap Town", "Mid Town", "Top Hill Official"}


def test_write_refuses_non_finite(tmp_path):
    with pytest.raises(ValueError):
        T.write_json(tmp_path / "x.json", {"a": float("nan")})


def test_data_card_section_replaces_between_markers(tmp_path):
    p = tmp_path / "card.md"
    p.write_text("# Card\n\nbefore\n", encoding="utf-8")
    T.update_card(p, "first")
    T.update_card(p, "second")
    text = p.read_text(encoding="utf-8")
    assert "first" not in text and text.count("second") == 1 and "before" in text


def test_card_compares_the_model_with_simple_rules():
    res = run_small()
    base = T._baselines(res["train"], res["held_out"])
    assert all(set(g) >= {"cost", "median_billions"} for g in base.values())
    body = T.card_body(res["model"], res["held_out"]["price"].to_numpy(), res["held_pred"], base)
    assert "This model" in body and "Area × neighborhood median" in body
    assert body.count("**yes**") == 1
    assert "Version 1 (price in billions" in body and "second look" in body


# --- artifacts on disk ---------------------------------------------------------

@pytest.fixture(scope="module")
def model():
    return json.loads(MODEL.read_text(encoding="utf-8"))


def test_model_json_keys_and_finite_numbers(model):
    assert MODEL_KEYS <= set(model)
    assert all(math.isfinite(v) for v in walk_numbers(model))
    assert model["runtime_ms"] > 0
    assert model["unit"] == "billion toman"
    assert model["date_range"] == {"start": "2024-05", "end": "2024-12"}
    assert set(model["cost"]) == {"train", "selection", "held_out"}
    assert set(model["cost_billions"]) == {"train", "selection", "held_out"}
    assert model["version"] == 2 and model["target"] == "log_price"
    assert model["previous_version"]["target"] == "price"
    assert set(model["rows"]) == {"train", "selection", "held_out"}
    assert set(model["hyperparameters"]) == {"alpha", "lambda", "iterations"}
    assert set(model["environment"]) == {"python", "numpy", "os"}
    assert set(model["scaling"]) == {"mu", "sigma"}
    assert len(model["weights"]) == len(model["features"]) == len(model["scaling"]["mu"])
    from training.features import feature_base
    assert "location" in {feature_base(f) for f in model["features"]}


def test_model_json_candidates_justify_the_choice(model):
    cands = [c for c in model["candidates"] if c["selection_cost"] is not None]
    assert len(cands) >= 10
    best = min(cands, key=lambda c: c["selection_cost"])
    assert best["features"] == model["features"]
    assert best["lambda"] == model["hyperparameters"]["lambda"]
    assert best["selection_cost"] == pytest.approx(model["cost"]["selection"])


def test_gap_has_plain_names(model):
    gap = model["held_out_gap"]
    assert gap["median_billions"] > 0 and 0 < gap["median_share_of_price"]
    text = json.dumps(gap).lower()
    assert not re.search(r"\b(mse|rmse|l1|l2)\b", text)


@pytest.mark.skipif(not RAW.exists(), reason="raw data not present")
def test_model_json_alone_reproduces_held_out_cost(model):
    from training.prep import run_clean
    df, _ = run_clean()
    train, sel, held = split_by_month(df)
    assert (len(train), len(sel), len(held)) == (model["rows"]["train"],
                                                 model["rows"]["selection"],
                                                 model["rows"]["held_out"])
    pred = T.predict_from_model(model, held)
    y = held["price"].to_numpy()
    assert float(np.mean((np.log(pred) - np.log(y)) ** 2) / 2) == pytest.approx(model["cost"]["held_out"])
    assert float(np.mean((pred - y) ** 2) / 2) == pytest.approx(model["cost_billions"]["held_out"])
    assert T.plain_gap(y, pred)["median_billions"] == pytest.approx(
        model["held_out_gap"]["median_billions"])


def test_listings_file():
    rows = load("listings.json")
    assert len(rows) == 60
    assert all(set(r) == T.LISTING_FIELDS for r in rows)


@pytest.mark.parametrize("name", ["listings.json", "funnel.json", "similar.json", "lab-train.json",
                                  "lab-clean.json", "lab-october.json", "lab-heldout.json",
                                  "lab-logprice.json", "neighborhoods.geojson"])
def test_no_forbidden_fields(name):
    keys = {k.lower() for k in walk_keys(load(name))}
    assert not keys & FORBIDDEN


def test_no_listing_coordinate_digits_in_any_web_file():
    """Tehran longitudes and latitudes would show up as 51.xxxx and 35.xxxx."""
    for f in DATA.glob("*.json"):
        # model.json is the synced copy of the trained model: fitted weights, scaling values and
        # costs, never coordinates. Some of its numbers (such as 51.95238...) match the pattern
        # by chance. The data files are the ones that could leak a coordinate.
        if f.name == "model.json":
            continue
        text = f.read_text(encoding="utf-8")
        assert not re.search(r"\b(35|51)\.\d{4,}\b", text), f.name


def test_funnel_file_is_the_run_clean_steps():
    steps = load("funnel.json")
    assert steps[0]["rows"] == 1_000_000
    assert all(set(s) == {"label", "rows", "removed"} for s in steps)
    assert all(a["rows"] >= b["rows"] for a, b in zip(steps, steps[1:]))
    assert all(a["rows"] - b["rows"] == b["removed"] for a, b in zip(steps, steps[1:]))


def test_profile_file(model):
    p = load("profile.json")
    assert {"months", "null_shares", "row_counts", "fields"} <= set(p)
    assert [m["month"] for m in p["months"]] == MONTHS
    assert all(m["rows"] > 0 and m["median_price_per_m2"] > 0 for m in p["months"])
    assert all(0 <= n["share"] <= 1 for n in p["null_shares"])
    assert p["row_counts"]["train"] == model["rows"]["train"]
    assert [f["src"] for f in p["fields"]][:2] == ["price_value", "building_size"]
    assert all({"src", "use", "proc", "in_model"} <= set(f) for f in p["fields"])


def test_web_data_stays_small():
    """The Lab ships area, price and the model's inputs for every training ad (about 1 MB),
    so the whole folder is a few megabytes before compression, and far less over the wire."""
    total = sum(f.stat().st_size for f in DATA.iterdir() if f.is_file()) + MODEL.stat().st_size
    assert total < 4_500_000
