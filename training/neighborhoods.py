"""Official Tehran neighborhoods, and which ads fall inside each one.

The boundaries are OpenStreetMap's Tehran neighborhoods (admin_level 11, "mahalleh"),
license ODbL. They are kept in the repository, already simplified, in
`data/osm/tehran_neighborhoods.geojson`, so a training run never needs the network.
To refresh them, save an Overpass answer to OVERPASS_QUERY and run

    python -m training.neighborhoods path/to/overpass.json

Ads are matched to a neighborhood by location: an ad belongs to the polygon that
contains its coordinates. Coordinates are used only inside this module; what leaves it
is per-neighborhood counts, medians and the Divar neighborhood most of its ads name
(the model's location input), never a single ad's position.
"""
from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
BOUNDARIES = ROOT / "data" / "osm" / "tehran_neighborhoods.geojson"
# Run at https://overpass-api.de/api/interpreter (or a mirror such as overpass.kumi.systems)
# and save the JSON answer. The box covers Tehran.
OVERPASS_QUERY = (
    '[out:json][timeout:250];'
    'relation["boundary"="administrative"]["admin_level"="11"](35.56,51.09,35.84,51.62);out geom;'
)
# A neighborhood needs this many ads before the map shows a price for it.
MIN_ADS = 15
# Degrees. About 13 m at Tehran's latitude: invisible at city zoom, a third of the size.
TOLERANCE = 0.00012


def _rings(relation: dict) -> list[list[tuple[float, float]]]:
    """Outer rings of an Overpass relation, joined from its member ways."""
    ways = [[(p["lon"], p["lat"]) for p in m["geometry"]] for m in relation["members"]
            if m["type"] == "way" and m.get("role") in ("outer", "") and m.get("geometry")]
    out = []
    while ways:
        ring = ways.pop(0)
        changed = True
        while ring[0] != ring[-1] and changed:
            changed = False
            for i, w in enumerate(ways):
                if w[0] == ring[-1]:
                    ring += w[1:]
                elif w[-1] == ring[-1]:
                    ring += w[::-1][1:]
                elif w[-1] == ring[0]:
                    ring = w + ring[1:]
                elif w[0] == ring[0]:
                    ring = w[::-1] + ring[1:]
                else:
                    continue
                ways.pop(i)
                changed = True
                break
        if len(ring) > 3:
            if ring[0] != ring[-1]:
                ring.append(ring[0])
            out.append(ring)
    return out


def _simplify(pts: list, tol: float = TOLERANCE) -> list:
    """Douglas-Peucker on an open line."""
    if len(pts) < 3:
        return pts
    a, b = np.array(pts[0]), np.array(pts[-1])
    p = np.array(pts)
    ab, ap = b - a, p - a
    d = np.abs(ab[0] * ap[:, 1] - ab[1] * ap[:, 0]) / (np.linalg.norm(ab) or 1.0)
    i = int(d.argmax())
    if d[i] > tol:
        return _simplify(pts[:i + 1], tol)[:-1] + _simplify(pts[i:], tol)
    return [pts[0], pts[-1]]


def simplify_ring(ring: list) -> list:
    """A closed ring, simplified in two halves so it cannot collapse to a line."""
    k = len(ring) // 2
    s = _simplify(ring[:k + 1]) + _simplify(ring[k:])[1:]
    return s if len(s) >= 4 else ring


def from_overpass(answer: dict) -> dict:
    """The boundary file: one feature per neighborhood, simplified, with its English name."""
    feats = []
    for rel in answer["elements"]:
        rings = _rings(rel)
        if not rings:
            continue
        tags = rel.get("tags", {})
        feats.append({
            "type": "Feature", "id": int(rel["id"]),
            "properties": {"name": tags.get("name:en") or tags.get("name:latin") or ""},
            "geometry": {"type": "MultiPolygon", "coordinates": [
                [[[round(x, 5), round(y, 5)] for x, y in simplify_ring(r)]] for r in rings]},
        })
    feats.sort(key=lambda f: f["id"])
    return {"type": "FeatureCollection",
            "source": "OpenStreetMap contributors, ODbL. admin_level 11 relations in Tehran.",
            "osm_timestamp": answer.get("osm3s", {}).get("timestamp_osm_base", ""),
            "features": feats}


def load_boundaries(path: Path = BOUNDARIES) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _inside(ring: np.ndarray, x: np.ndarray, y: np.ndarray) -> np.ndarray:
    """Ray casting for many points against one closed ring."""
    xs, ys = ring[:, 0], ring[:, 1]
    res = np.zeros(len(x), bool)
    for i in range(len(ring) - 1):
        x1, y1, x2, y2 = xs[i], ys[i], xs[i + 1], ys[i + 1]
        crosses = (y1 > y) != (y2 > y)
        xi = (x2 - x1) * (y - y1) / ((y2 - y1) or 1e-12) + x1
        res ^= crosses & (x < xi)
    return res


def assign(lon, lat, boundaries: dict) -> np.ndarray:
    """The OSM id of the neighborhood containing each point, or 0 when none does."""
    x, y = np.asarray(lon, float), np.asarray(lat, float)
    out = np.zeros(len(x), dtype=np.int64)
    ok = np.isfinite(x) & np.isfinite(y)
    for f in boundaries["features"]:
        for poly in f["geometry"]["coordinates"]:
            ring = np.array(poly[0])
            box = (ok & (out == 0) & (x >= ring[:, 0].min()) & (x <= ring[:, 0].max())
                   & (y >= ring[:, 1].min()) & (y <= ring[:, 1].max()))
            idx = np.where(box)[0]
            if len(idx):
                out[idx[_inside(ring, x[idx], y[idx])]] = f["id"]
    return out


def build_map(frame: pd.DataFrame, boundaries: dict, min_ads: int = MIN_ADS) -> dict:
    """The site's neighborhood map.

    `frame` is every cleaned ad with `lat` and `lon`. Each feature keeps its geometry and
    name and gains `ads` (ads inside it). With at least `min_ads` ads it also gains `ppm2`
    (median price per m2, million toman) and `divar`, the Divar neighborhood most of its
    ads name, which is what the model is given for a flat there.
    """
    ids = assign(frame["lon"], frame["lat"], boundaries)
    feats = []
    for f in boundaries["features"]:
        mask = ids == f["id"]
        n = int(mask.sum())
        props = {"name": f["properties"]["name"], "ads": n}
        if n >= min_ads:
            props["ppm2"] = round(float(frame.loc[mask, "price_per_m2"].median()))
            counts = Counter(s for s in frame.loc[mask, "neighborhood"] if isinstance(s, str))
            if counts:
                # Highest count first, alphabetical on a tie, so the result is stable.
                props["divar"] = min(counts, key=lambda s: (-counts[s], s))
        feats.append({"type": "Feature", "id": f["id"], "properties": props, "geometry": f["geometry"]})
    return {"type": "FeatureCollection", "features": feats}


def similar_ads(frame: pd.DataFrame, boundaries: dict, months: list[str]) -> dict[str, list[list[float]]]:
    """Area and price of the ads in `months`, grouped by neighborhood id.

    The Estimate page turns these into one range ("similar ads then: 11.9 to 15.5 billion");
    no single ad is shown.
    """
    recent = frame[frame["month"].isin(months)]
    ids = assign(recent["lon"], recent["lat"], boundaries)
    out: dict[str, list[list[float]]] = {}
    for i, (area, price) in zip(ids, zip(recent["area"], recent["price"])):
        if i:
            out.setdefault(str(int(i)), []).append([round(float(area), 1), round(float(price), 2)])
    return out


def official_names(feature_map: dict) -> dict[str, str]:
    """Divar neighborhood to the official name of the one neighborhood it is matched to.

    A Divar name matched to two or more official neighborhoods is left out, so a caller
    falls back to the Divar name rather than guessing.
    """
    seen: dict[str, list[str]] = {}
    for f in feature_map["features"]:
        slug = f["properties"].get("divar")
        if slug:
            seen.setdefault(slug, []).append(f["properties"]["name"])
    return {slug: names[0] for slug, names in seen.items() if len(names) == 1}


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(__doc__)
        return 2
    answer = json.loads(Path(argv[1]).read_text(encoding="utf-8"))
    BOUNDARIES.parent.mkdir(parents=True, exist_ok=True)
    data = from_overpass(answer)
    BOUNDARIES.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n",
                          encoding="utf-8", newline="\n")
    print(f"{len(data['features'])} neighborhoods, OSM data of {data['osm_timestamp']}, "
          f"{BOUNDARIES.stat().st_size:,} bytes")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
