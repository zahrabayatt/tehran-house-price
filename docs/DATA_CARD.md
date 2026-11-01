# Data card

Cleaned Tehran apartment asking-price data used to train the model. Produced by `training/prep.py` from `data/raw/tehran_apartment_sell.parquet` (see `docs/DATA_PROFILE.md` for the raw profile). All numbers below were measured from that file; reproduce the funnel with `python -m training.prep`.

- Source: `divarofficial/real_estate_ads`, license ODbL. Processed data carries the same attribution.
- Prices are **asking prices** from ads, not transaction prices.
- Unit: `price_value` is toman (conclusion in `DATA_PROFILE.md`, resting on magnitude plus a stated reference assumption). Output `price` is in **billions of toman**; `price_per_m2` is in **millions of toman per m2**.

## Output columns

| Column | Meaning |
|---|---|
| `area` | `building_size`, m2 |
| `rooms` | 0 to 5 (5 means "five or more"; 0 means "no room", studio) |
| `age` | `1403 - construction year` (Solar Hijri; 1403 is the newest year in the data). The "before 1370" bucket is parsed as 1369, so it becomes age 34 and the column tops out there |
| `parking`, `elevator`, `storage` | `has_parking`, `has_elevator`, `has_warehouse` as 0 or 1 |
| `neighborhood` | `neighborhood_slug`, or `None` when blank (the row is kept) |
| `month` | `created_at_month` as `YYYY-MM` |
| `price` | `price_value / 1e9` |
| `price_per_m2` | `price_value / building_size / 1e6` |

Titles, descriptions, user fields and coordinates are not in the frame returned by `clean`. Latitude and longitude exist only in `clean_with_coords` (as `lat`, `lon`), which is for building hexagon features in training and is never shipped.

## Cleaning funnel

Order matters for the per-step counts (not for the final set, except where noted). Final rows: **81,603**.

| Step | Rows after | Removed |
|---|---|---|
| All ads in dataset | 1,000,000 | |
| `city_slug = tehran` | 190,904 | 809,096 |
| `cat3_slug = apartment-sell` | 84,586 | 106,318 |
| `price_mode = مقطوع` (stored raw rows) | 84,584 | 2 |
| Created 2024-05 to 2024-12 | 83,474 | 1,110 |
| Exact duplicate rows removed | 83,355 | 119 |
| Price missing or not positive | 83,355 | 0 |
| Area missing | 83,354 | 1 |
| Rooms missing or unparseable | 83,354 | 0 |
| Construction year missing, unparseable or after 1403 | 83,354 | 0 |
| Parking, elevator or storage flag missing | 83,354 | 0 |
| Area outside 25 to 600 m2 | 83,124 | 230 |
| Price per m2 outside 12 to 600 million toman | 81,603 | 1,521 |

Total removed from the stored rows: 2,981 of 84,584 (3.52%).

### Training window

Months 2024-05 through 2024-12 (controller ruling; constants `WINDOW_START`, `WINDOW_END`). These eight months hold 9,447 to 11,802 rows each. Outside them the data is thin: 2024-04 has 651 rows, every other month 234 or fewer. The window keeps 83,474 of 84,584 rows (98.69%) and drops 1,110.

### Duplicates

A row is a duplicate if it matches an earlier row in every stored raw column, including latitude and longitude. Two ads that differ only in coordinates are kept. 119 removed inside the window (120 over all months, per the profile).

### Required fields, decided per field

| Field | Rule | Removed here | Why |
|---|---|---|---|
| `price_value` | missing or <= 0 dropped | 0 | The target. No imputation. |
| `building_size` | missing dropped | 1 | The most important predictor; imputing would invent the answer. |
| `rooms_count` | missing or unparseable dropped; must be 0 to 5 | 0 | Every one of the six labels parses (exact match). |
| `construction_year` | missing, unparseable or after 1403 dropped | 0 | Every value parses, including the "before 1370" bucket (991 rows over all months) and Persian digits. |
| `has_parking`, `has_elevator`, `has_warehouse` | missing dropped | 0 | A missing flag is not "no", and it affects at most one row. |
| `neighborhood_slug` | **kept**; blank becomes `None` | 0 | Training treats unknown neighborhood with the Tehran fallback. This raw file has no blank neighborhood, so the rule currently has no effect, but the code and tests cover it. |

In this raw file all of the missing values sit on a single row, which the `Area missing` step catches first, so the later steps show 0. Counted independently, that row is missing area, rooms, parking, elevator and storage. Coordinates are never required: 25.4% of raw rows lack them, and those rows are kept in `clean` and carry NaN `lat`/`lon` in `clean_with_coords`.

## Bounds

Both bounds are inclusive and were picked from the distribution of the 83,354 rows that reach the area step, not to improve the fit. Neither bound is tuned against model error. The goal is to remove values that cannot be an apartment or its asking price (typos, extra zeros, rent or deposit entered in the sale price, placeholder prices such as 1,111,111,111) while keeping expensive apartments.

### Area: 25 to 600 m2

Raw `building_size` runs from 1 to 9,999,999. In this window, 99.9th percentile is 1,110 m2 and 99.95th is 2,200 m2.

- **Low, 25 m2.** Counts per range: 0 to 10 m2: 31 rows, 10 to 15: 11, 15 to 20: 15, 20 to 25: 9, 25 to 30: 88. Rows below 25 are 61 in total and are sparse; the density jumps ninefold at 25. The five-percent quantile is 45 m2 and the first percentile 37 m2, so 25 is far below the real mass.
- **High, 600 m2.** 600 m2 is the 99.8th percentile (607 m2) and about 7.4 times the median (82 m2). Above it there are 169 rows; 93 of those exceed 1,000 m2 and 24 are 10,000 m2 or more (not apartments). Legitimate large units exist and stay: 48 rows lie in 500 to 600 m2, mostly luxury neighborhoods (Zafaraniyeh, Elahiyeh, Farmaniyeh). Rows from 600 to 1,000 m2 are a mix of whole buildings and typos and the sample is too thin to separate them.
- Removed: **230** (61 below 25, 169 above 600).

### Price per m2: 12 to 600 million toman

Measured on the 83,124 rows with area 25 to 600 m2 (median 84.9 million toman per m2).

Counts by range of price per m2 (million toman):

| Range | Rows |
|---|---|
| up to 12 | 1,265 |
| 12 to 15 | 245 |
| 15 to 20 | 456 |
| 20 to 25 | 915 |
| 25 to 30 | 1,582 |
| 500 to 600 | 62 |
| 600 to 700 | 26 |
| 700 to 1,000 | 50 |
| 1,000 to 10,000 | 56 |
| above 10,000 | 129 |

- **Low, 12.** Below 12 are 1,260 rows (1.5%); 894 of them are under 1 million toman per m2 (prices such as 1, 111, 1,111, or a few hundred million entered for a whole flat). The count per million toman falls to its minimum in the 10 to 12 band (about 24 rows per million) and climbs to about 83 in 12 to 15, where real cheap apartments begin. The 1st percentile of the raw column is 0.26 million toman per m2, the 5th is 29.
- **High, 600.** The 99.9th percentile of the kept rows is 500 million toman per m2, and the median of the most expensive neighborhood (Velenjak) is about 250. 600 is 2.4 times that median and 7 times the Tehran median. Rows between 400 and 600 million toman per m2 are 251; sampling them shows them in Elahiyeh, Velenjak, Zafaraniyeh, Niavaran, Saadat Abad, so they are kept. Beyond 600 the density keeps falling (26 in 600 to 700, 50 in 700 to 1,000), the rows drift to non-luxury neighborhoods and placeholder prices (111,111,111,111), and 129 rows exceed 10,000 million toman per m2 (price entered with extra zeros, up to 9e13).
- Removed: **1,521** (1,260 below 12, 261 above 600).

The upper bound is a judgment call in a smooth tail, not a gap in the data. Moving it between 500 and 700 changes about 90 rows of 81,603 (0.1%): 62 in the 500 to 600 band and 26 in 600 to 700.

### Not removed

No row is removed for being expensive in absolute terms. The highest kept `price` is 360 billion toman (a large luxury unit), and the highest kept `price_per_m2` is 600. No outlier rule such as a z-score or percentile cut is applied.

## Output profile

| Column | Min | Median | Max |
|---|---|---|---|
| `area` | 25 | 81 | 600 |
| `rooms` | 0 | 2 | 5 |
| `age` | 0 | 9 | 34 |
| `price` (billion toman) | 0.49 | 6.85 | 360 |
| `price_per_m2` (million toman) | 12.0 | 85.3 | 600 |

- Share with parking 80.5%, elevator 75.2%, storage 90.1%.
- Rows by month: 2024-05 9,893; 06 9,594; 07 9,923; 08 9,685; 09 9,237; 10 10,758; 11 11,140; 12 11,373.
- 343 distinct neighborhoods, 50 of them with fewer than 30 rows; no row has `neighborhood = None`.

## Known limits

- Asking prices, not sale prices; ads may be negotiable, stale or duplicated across ad types.
- One year of data with a dense stretch of eight months; no seasonality or long-run trend can be learned. Median price per m2 is nearly flat across the window (81.9 to 87.0 million toman).
- `age` is capped at 34 by the "before 1370" bucket, so it hides older buildings.
- Coordinates are present for 51% of rows in 2024-05 and 84% by 2024-12, so location features built from them cover later months better.
- A neighborhood slug is the site's label and may mix areas of different price level.
