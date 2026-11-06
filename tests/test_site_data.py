"""The official-neighborhood build and the data files the new pages read."""
import json
import re
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from training import neighborhoods as nb

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "web" / "public" / "data"
MODEL = json.loads((ROOT / "model" / "model.json").read_text(encoding="utf-8"))


def load(name):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


def square(fid, x0, y0, size=0.01, name="Hood"):
    ring = [[x0, y0], [x0 + size, y0], [x0 + size, y0 + size], [x0, y0 + size], [x0, y0]]
    return {"type": "Feature", "id": fid, "properties": {"name": name},
            "geometry": {"type": "MultiPolygon", "coordinates": [[ring]]}}


BOXES = {"type": "FeatureCollection",
         "features": [square(1, 51.30, 35.70, name="West"), square(2, 51.40, 35.70, name="East")]}


def ads(n, lon, lat, ppm2, hood, month="2024-11"):
    return pd.DataFrame({"lon": [lon] * n, "lat": [lat] * n, "price_per_m2": [ppm2] * n,
                         "neighborhood": [hood] * n, "month": [month] * n,
                         "area": [100.0] * n, "price": [ppm2 / 10] * n})


# --- geometry -------------------------------------------------------------------

def test_points_are_assigned_by_location():
    ids = nb.assign([51.305, 51.405, 51.35, np.nan], [35.705, 35.705, 35.705, 35.705], BOXES)
    assert ids.tolist() == [1, 2, 0, 0]


def test_simplified_ring_stays_closed_and_keeps_its_corners():
    ring = [[0, 0], [0.5, 0.00001], [1, 0], [1, 1], [0, 1], [0, 0]]
    s = nb.simplify_ring(ring)
    assert s[0] == s[-1] and len(s) >= 4
    assert [0.5, 0.00001] not in s


def test_overpass_relations_become_features():
    rel = {"type": "relation", "id": 9, "tags": {"name:en": "Nine"}, "members": [
        {"type": "way", "role": "outer", "geometry": [{"lon": 0, "lat": 0}, {"lon": 1, "lat": 0}, {"lon": 1, "lat": 1}]},
        {"type": "way", "role": "outer", "geometry": [{"lon": 1, "lat": 1}, {"lon": 0, "lat": 1}, {"lon": 0, "lat": 0}]}]}
    out = nb.from_overpass({"osm3s": {"timestamp_osm_base": "T"}, "elements": [rel]})
    f = out["features"][0]
    assert f["id"] == 9 and f["properties"] == {"name": "Nine"} and out["osm_timestamp"] == "T"
    ring = f["geometry"]["coordinates"][0][0]
    assert ring[0] == ring[-1] and len(ring) == 5


# --- per-neighborhood values ------------------------------------------------------

def test_map_needs_enough_ads_and_names_the_most_common_divar_neighborhood():
    frame = pd.concat([ads(10, 51.305, 35.705, 50.0, "a"), ads(6, 51.305, 35.705, 90.0, "b"),
                       ads(14, 51.405, 35.705, 70.0, "c")], ignore_index=True)
    m = nb.build_map(frame, BOXES)
    west, east = (f["properties"] for f in m["features"])
    assert west == {"name": "West", "ads": 16, "ppm2": 50, "divar": "a"}
    assert east == {"name": "East", "ads": 14}           # under 15 ads: no price, not selectable


def test_official_names_skip_a_divar_name_split_over_two_neighborhoods():
    fm = {"features": [{"properties": {"name": "North X", "divar": "x"}},
                       {"properties": {"name": "South X", "divar": "x"}},
                       {"properties": {"name": "Yard", "divar": "y"}},
                       {"properties": {"name": "Empty"}}]}
    assert nb.official_names(fm) == {"y": "Yard"}


def test_similar_ads_only_from_the_given_months():
    frame = pd.concat([ads(3, 51.305, 35.705, 50.0, "a", "2024-11"),
                       ads(2, 51.305, 35.705, 50.0, "a", "2024-06")], ignore_index=True)
    out = nb.similar_ads(frame, BOXES, ["2024-11", "2024-12"])
    assert out == {"1": [[100.0, 5.0]] * 3}


# --- the committed files ----------------------------------------------------------

def test_boundary_file_is_osm_with_a_date():
    b = nb.load_boundaries()
    assert b["osm_timestamp"].startswith("20") and "OpenStreetMap" in b["source"]
    assert len(b["features"]) > 300
    assert all(f["geometry"]["type"] == "MultiPolygon" for f in b["features"])


def test_map_file_matches_the_model():
    m = load("neighborhoods.geojson")
    priced = [f["properties"] for f in m["features"] if "ppm2" in f["properties"]]
    assert len(priced) > 300
    assert all(p["ads"] >= nb.MIN_ADS and p["ppm2"] > 0 for p in priced)
    # Every Divar neighborhood the map hands to the model is a real Divar slug.
    slugs = {p["divar"] for p in priced}
    assert len(slugs & set(MODEL["location"]["lookup"])) > 200
    saadat = [p for p in priced if p["name"] == "Saadat Abad"]
    assert saadat and saadat[0]["divar"] == "saadat-abad"


def test_lab_files_have_one_value_per_ad():
    t = load("lab-train.json")
    n = MODEL["rows"]["train"]
    assert t["rows"] == n
    assert all(len(t[k]) == n for k in ("area", "rooms", "age", "parking", "location", "price"))
    assert len(t["examples"]) == 3
    h = load("lab-heldout.json")
    assert all(len(h[k]) == MODEL["rows"]["held_out"] for k in ("estimate", "asked", "area", "rooms", "hood"))
    assert h["cost"]["held_out"] == pytest.approx(MODEL["cost"]["held_out"], abs=1e-3)
    o = load("lab-october.json")
    assert len(o["area"]) == len(o["price"]) == MODEL["rows"]["selection"]


def test_stored_ads_cover_the_real_cleaning_limits():
    c = load("lab-clean.json")
    area, ppm2 = np.array(c["area"]), np.array(c["ppm2"])
    kept = (area >= 25) & (area <= 600) & (ppm2 >= 12) & (ppm2 <= 600)
    funnel = load("funnel.json")
    assert int(kept.sum()) == funnel[-1]["rows"]


def test_no_coordinates_in_ad_files():
    for name in ("similar.json", "lab-train.json", "lab-clean.json", "lab-october.json",
                 "lab-heldout.json", "listings.json"):
        text = (DATA / name).read_text(encoding="utf-8")
        assert not re.search(r"\b(35|51)\.\d{4,}\b", text), name
