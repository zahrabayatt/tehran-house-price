"""Profile the filtered Tehran apartment-sale subset and write docs/DATA_PROFILE.md.

Every number in the output is computed from data/raw/ at run time. Run
`python training/download.py` first.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from training.parsing import parse_rooms, parse_year  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "docs" / "DATA_PROFILE.md"

WINDOW_START, WINDOW_END = "2024-04", "2025-03"
MIN_WINDOW_ROWS = 5_000
# Rough Tehran bounding box, used only to count coordinates that fall inside it.
TEHRAN_BBOX = {"lat": (35.55, 35.85), "lon": (51.05, 51.65)}
# Provisional plausibility range, only to give a first "after basic checks" count.
PROVISIONAL_SIZE = (10, 1000)

NULL_COLUMNS = [
    "price_value", "building_size", "rooms_count", "construction_year",
    "has_parking", "has_elevator", "has_warehouse", "neighborhood_slug",
    "created_at_month", "location_latitude", "location_longitude",
]


def md_table(headers, rows):
    lines = ["| " + " | ".join(headers) + " |", "|" + "|".join("---" for _ in headers) + "|"]
    lines += ["| " + " | ".join(str(c) for c in row) + " |" for row in rows]
    return "\n".join(lines)


def n(x):
    return f"{int(x):,}"


def pct(part, whole):
    return f"{100 * part / whole:.2f}%"


def num(x):
    return f"{x:,.0f}"


def main():
    df = pd.read_parquet(RAW / "tehran_apartment_sell.parquet")
    funnel = json.loads((RAW / "funnel.json").read_text(encoding="utf-8"))
    source = json.loads((RAW / "SOURCE.json").read_text(encoding="utf-8"))
    total = len(df)

    df["month"] = pd.to_datetime(df["created_at_month"]).dt.strftime("%Y-%m")
    df["rooms"] = df["rooms_count"].map(parse_rooms)
    df["year"] = df["construction_year"].map(parse_year)
    size = df["building_size"]
    valid_ppm = (df["price_value"] > 0) & (size > 0)
    df["ppm2"] = np.where(valid_ppm, df["price_value"] / size.where(size > 0), np.nan)

    out = ["# Data profile", ""]
    out.append(
        "All figures are measured from `data/raw/tehran_apartment_sell.parquet` by "
        "`training/profile_data.py`. Nothing here is estimated or taken from outside the data "
        "unless marked as a reference assumption."
    )

    # 1. Source and funnel
    cols = ", ".join(f"`{c}`" for c in source["columns"])
    out += ["", "## Source", "",
            f"- Dataset: `{source['dataset']}` (license ODbL).",
            f"- Dataset revision (`sha` from the Hugging Face API): `{source['dataset_revision']}`.",
            f"- Parquet conversion read: revision `{source['parquet_revision']}` of `refs/convert/parquet` "
            f"({len(source['parquet_files'])} files).",
            f"- Filter: `city_slug={source['filter']['city_slug']}`, `cat3_slug={source['filter']['cat3_slug']}`, "
            f"`price_mode={source['filter']['price_mode']}`.",
            f"- Columns kept: {cols}. Titles, descriptions, and user fields are never read."]
    out += ["", "## Row funnel", "", md_table(
        ["Step", "Rows"],
        [["All rows in dataset", n(funnel["total_rows"])],
         ["`city_slug = tehran`", n(funnel["tehran_rows"])],
         ["+ `cat3_slug = apartment-sell`", n(funnel["tehran_apartment_sell_rows"])],
         ["+ `price_mode = مقطوع` (fixed price), stored in `data/raw/`",
          n(funnel["tehran_apartment_sell_fixed_price_rows"])]])]
    assert funnel["tehran_apartment_sell_fixed_price_rows"] == total

    # 2. Time coverage and window check
    months = df["month"].value_counts().sort_index()
    in_window = df[(df["month"] >= WINDOW_START) & (df["month"] <= WINDOW_END)]
    first, last = months.index.min(), months.index.max()
    big = months[months >= 1000]
    span = pd.period_range(first, last, freq="M")
    out += ["", "## Time coverage", "",
            f"- Rows have `created_at_month` from {first} to {last} ({len(span)} calendar months in that span, "
            f"{len(months)} of them with at least one row).",
            f"- {len(big)} months have 1,000 or more rows: {big.index.min()} to {big.index.max()} "
            f"({n(big.sum())} rows, {pct(big.sum(), total)} of the subset).",
            "", md_table(["Month", "Rows"], [[m, n(c)] for m, c in months.items()])]
    ok = len(in_window) >= MIN_WINDOW_ROWS
    basic = in_window[(in_window["price_value"] > 0)
                      & in_window["building_size"].between(*PROVISIONAL_SIZE)
                      & in_window["rooms"].notna() & in_window["year"].notna()
                      & in_window["neighborhood_slug"].notna()]
    dense = in_window[(in_window["month"] >= "2024-05") & (in_window["month"] <= "2024-12")]
    out += ["", f"## Training window {WINDOW_START} to {WINDOW_END}", "",
            f"- Rows with `created_at_month` in {WINDOW_START} through {WINDOW_END}, before any cleaning: "
            f"**{n(len(in_window))}**.",
            f"- Threshold of {n(MIN_WINDOW_ROWS)} rows: **{'met' if ok else 'NOT met'}**.",
            f"- Provisional count after basic checks (price_value > 0, building_size between "
            f"{PROVISIONAL_SIZE[0]} and {PROVISIONAL_SIZE[1]} m2, rooms/year/neighborhood present): "
            f"{n(len(basic))}. These are not the final cleaning rules.",
            f"- Populated months inside the window: {in_window['month'].min()} to "
            f"{in_window['month'].max()}; {pct(len(dense), len(in_window))} "
            "of window rows fall in 2024-05 through 2024-12."]

    # 3. Null shares and parse failures
    rows = []
    for col in NULL_COLUMNS:
        k = df[col].isna().sum()
        rows.append([f"`{col}`", n(k), pct(k, total)])
    out += ["", "## Null shares (raw)", "", md_table(["Column", "Null rows", "Share of subset"], rows)]
    rooms_fail = df["rooms_count"].notna() & df["rooms"].isna()
    year_fail = df["construction_year"].notna() & df["year"].isna()
    before = df["construction_year"].astype("string").str.startswith("قبل از").fillna(False)
    room_rows = [[k, n(v), df.loc[df["rooms_count"] == k, "rooms"].iloc[0]]
                 for k, v in df["rooms_count"].value_counts().items()]
    out += ["", "## Parsing", "",
            f"- `rooms_count` values present but not parsed by `parse_rooms`: {n(rooms_fail.sum())}.",
            f"- `construction_year` values present but not parsed by `parse_year`: {n(year_fail.sum())}.",
            f"- `construction_year` values in the 'before 1370' bucket (parsed as 1369): {n(before.sum())}.",
            f"- Parsed construction year range: {int(df['year'].min())} to {int(df['year'].max())} (Solar Hijri).",
            "", "Room counts by label:", "",
            md_table(["`rooms_count`", "Rows", "Parsed"], room_rows)]
    flags = []
    for col in ["has_parking", "has_elevator", "has_warehouse"]:
        c = df[col].value_counts(dropna=False)
        flags.append([f"`{col}`", n(c.get(True, 0)), n(c.get(False, 0)), n(df[col].isna().sum())])
    out += ["", md_table(["Flag", "True", "False", "Null"], flags)]

    # 4. Distributions
    qs = [0, 0.001, 0.01, 0.05, 0.25, 0.5, 0.75, 0.95, 0.99, 0.999, 1]
    dist_rows = []
    for col in ["price_value", "building_size", "ppm2"]:
        s = df[col].dropna()
        dist_rows.append([f"`{col}`"] + [num(s.quantile(q)) for q in qs])
    out += ["", "## Distributions (raw, before cleaning)", "",
            md_table(["Column"] + [f"q{q:g}" for q in qs], dist_rows),
            "", "`ppm2` is `price_value / building_size` for rows with both positive "
            f"({n(valid_ppm.sum())} rows).", ""]
    out.append(f"- Rows with `building_size` below {PROVISIONAL_SIZE[0]}: {n((size < PROVISIONAL_SIZE[0]).sum())}; "
               f"above {PROVISIONAL_SIZE[1]}: {n((size > PROVISIONAL_SIZE[1]).sum())}.")
    out.append(f"- Rows with `price_value` <= 0: {n((df['price_value'] <= 0).sum())}.")
    dup = df.drop(columns=["month", "rooms", "year", "ppm2"]).duplicated().sum()
    out.append(f"- Rows identical to an earlier row in every kept column: {n(dup)}.")

    # 5. Price unit evidence
    sane = df[valid_ppm & size.between(*PROVISIONAL_SIZE) & (df["month"] >= WINDOW_START)]
    med = sane["ppm2"].median()
    p10, p90 = sane["ppm2"].quantile([0.10, 0.90])
    out += ["", "## Price unit: toman or rial", "",
            f"- Median `price_value / building_size` over {n(len(sane))} rows with building_size between "
            f"{PROVISIONAL_SIZE[0]} and {PROVISIONAL_SIZE[1]} m2 (from {WINDOW_START}): **{num(med)} per m2** "
            f"(10th to 90th percentile: {num(p10)} to {num(p90)}).",
            f"- Read as toman, the median is {med / 1e6:,.1f} million toman per m2. "
            f"Read as rial, it would be {med / 10 / 1e6:,.1f} million toman per m2.",
            "- Reference assumption (not measured from this data): Tehran apartment asking prices in 2024 "
            "were on the order of tens to a few hundred million toman per m2. The toman reading falls in "
            "that range; the rial reading, a tenth of it, does not.",
            "- **Conclusion: `price_value` is in toman.** This rests on magnitude plus the reference "
            "assumption above; the dataset card does not document the unit."]

    # 6. Monthly median ppm2
    g = df[valid_ppm].groupby("month")["ppm2"].agg(["count", "median"])
    g = g.reindex([p.strftime("%Y-%m") for p in span])
    out += ["", "## Monthly median price per m2", "",
            "Rows with `price_value > 0` and `building_size > 0`, no other cleaning. "
            "Months with few rows are noisy. The data contain only "
            f"{len(months)} calendar months with any row and {len(big)} with 1,000 or more, so a series "
            f"of 24 well-populated months is not available; all {len(span)} months of the span are listed.", "",
            md_table(["Month", "Rows", "Median price per m2"],
                     [[m, "0" if np.isnan(r["count"]) else n(r["count"]),
                       "n/a" if np.isnan(r["median"]) else num(r["median"])]
                      for m, r in g.iterrows()])]
    full = g[g["count"] >= 1000]["median"]
    if len(full) > 1:
        out.append(f"\n- Across months with 1,000 or more rows ({full.index.min()} to {full.index.max()}), the "
                   f"monthly median ranges from {num(full.min())} to {num(full.max())} "
                   f"({100 * (full.iloc[-1] / full.iloc[0] - 1):+.1f}% from first to last).")

    # 7. Coordinates
    has_xy = df["location_latitude"].notna() & df["location_longitude"].notna()
    inside = (has_xy & df["location_latitude"].between(*TEHRAN_BBOX["lat"])
              & df["location_longitude"].between(*TEHRAN_BBOX["lon"]))
    xy_unique = df.loc[has_xy, ["location_latitude", "location_longitude"]].drop_duplicates().shape[0]
    by_month = ", ".join(
        f"{m} {pct(has_xy[df['month'] == m].sum(), (df['month'] == m).sum())}" for m in big.index)
    out += ["", "## Coordinate coverage", "",
            f"- Rows with both coordinates: {n(has_xy.sum())} ({pct(has_xy.sum(), total)}).",
            f"- Rows with coordinates inside latitude {TEHRAN_BBOX['lat'][0]} to {TEHRAN_BBOX['lat'][1]}, "
            f"longitude {TEHRAN_BBOX['lon'][0]} to {TEHRAN_BBOX['lon'][1]}: {n(inside.sum())} "
            f"({pct(inside.sum(), total)} of subset, {pct(inside.sum(), has_xy.sum())} of rows with coordinates).",
            f"- Rows with coordinates outside that box: {n((has_xy & ~inside).sum())}.",
            f"- Distinct coordinate pairs: {n(xy_unique)}.",
            f"- Share of rows with coordinates by month (months with 1,000 or more rows): {by_month}."]

    # 8. Neighborhoods
    nb = df["neighborhood_slug"].value_counts()
    nn = df["neighborhood_slug"].isna().sum()
    small = nb[nb < 30]
    out += ["", "## Rows per neighborhood", "",
            f"- Distinct `neighborhood_slug` values: {n(len(nb))}; null: {n(nn)} ({pct(nn, total)}).",
            f"- Neighborhoods with at least 30 rows: {n((nb >= 30).sum())} covering {n(nb[nb >= 30].sum())} rows "
            f"({pct(nb[nb >= 30].sum(), total)}).",
            f"- Neighborhoods with fewer than 30 rows: {n(len(small))} covering {n(small.sum())} rows "
            f"({pct(small.sum(), total)}).",
            f"- Neighborhoods with at least 100 rows: {n((nb >= 100).sum())}; at least 500: {n((nb >= 500).sum())}.",
            f"- Median rows per neighborhood: {nb.median():.0f}; largest: `{nb.index[0]}` with {n(nb.iloc[0])}.",
            "", "Top 25 neighborhoods:", "",
            md_table(["`neighborhood_slug`", "Rows", "Share"],
                     [[f"`{k}`", n(v), pct(v, total)] for k, v in nb.head(25).items()])]

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("\n".join(out) + "\n", encoding="utf-8")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
