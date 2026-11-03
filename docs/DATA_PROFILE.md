# Data profile

All figures are measured from `data/raw/tehran_apartment_sell.parquet` by `training/profile_data.py`. Nothing here is estimated or taken from outside the data unless marked as a reference assumption.

## Source

- Dataset: `divarofficial/real_estate_ads` (license ODbL).
- Dataset revision (`sha` from the Hugging Face API): `e9446ee97b8e6eb9bd62bdfd7548f1bc8973be85`.
- Parquet conversion read: revision `e6e201dd5e4ea21cbd615746748c155f4628ed7b` of `refs/convert/parquet` (2 files).
- Filter: `city_slug=tehran`, `cat3_slug=apartment-sell`, `price_mode=مقطوع`.
- Columns kept: `city_slug`, `cat3_slug`, `price_mode`, `price_value`, `building_size`, `rooms_count`, `construction_year`, `has_parking`, `has_elevator`, `has_warehouse`, `neighborhood_slug`, `created_at_month`, `location_latitude`, `location_longitude`. Titles, descriptions, and user fields are never read.

## Row funnel

| Step | Rows |
|---|---|
| All rows in dataset | 1,000,000 |
| `city_slug = tehran` | 190,904 |
| + `cat3_slug = apartment-sell` | 84,586 |
| + `price_mode = مقطوع` (fixed price), stored in `data/raw/` | 84,584 |

## Time coverage

- Rows have `created_at_month` from 2022-10 to 2025-02 (29 calendar months in that span, 23 of them with at least one row).
- 8 months have 1,000 or more rows: 2024-05 to 2024-12 (83,474 rows, 98.69% of the subset).

| Month | Rows |
|---|---|
| 2022-10 | 1 |
| 2023-04 | 1 |
| 2023-05 | 1 |
| 2023-07 | 4 |
| 2023-08 | 2 |
| 2023-09 | 2 |
| 2023-10 | 3 |
| 2023-11 | 12 |
| 2023-12 | 15 |
| 2024-01 | 37 |
| 2024-02 | 41 |
| 2024-03 | 85 |
| 2024-04 | 651 |
| 2024-05 | 10,024 |
| 2024-06 | 9,743 |
| 2024-07 | 10,117 |
| 2024-08 | 9,846 |
| 2024-09 | 9,447 |
| 2024-10 | 11,028 |
| 2024-11 | 11,467 |
| 2024-12 | 11,802 |
| 2025-01 | 234 |
| 2025-02 | 21 |

## Initial profiling window (superseded; see DATA_CARD)

- Rows with `created_at_month` in 2024-04 through 2025-03, before any cleaning: **84,380**.
- Threshold of 5,000 rows: **met**.
- Provisional count after basic checks (price_value > 0, building_size between 10 and 1000 m2, rooms/year/neighborhood present): 84,259. These are not the final cleaning rules.
- Populated months inside the window: 2024-04 to 2025-02; 98.93% of window rows fall in 2024-05 through 2024-12.

## Null shares (raw)

| Column | Null rows | Share of subset |
|---|---|---|
| `price_value` | 0 | 0.00% |
| `building_size` | 1 | 0.00% |
| `rooms_count` | 1 | 0.00% |
| `construction_year` | 0 | 0.00% |
| `has_parking` | 1 | 0.00% |
| `has_elevator` | 1 | 0.00% |
| `has_warehouse` | 1 | 0.00% |
| `neighborhood_slug` | 0 | 0.00% |
| `created_at_month` | 0 | 0.00% |
| `location_latitude` | 21,458 | 25.37% |
| `location_longitude` | 21,458 | 25.37% |

## Parsing

- `rooms_count` values present but not parsed by `parse_rooms`: 0.
- `construction_year` values present but not parsed by `parse_year`: 0.
- `construction_year` values in the 'before 1370' bucket (parsed as 1369): 991.
- Parsed construction year range: 1369 to 1403 (Solar Hijri).

Room counts by label:

| `rooms_count` | Rows | Parsed |
|---|---|---|
| دو | 42,669 | 2.0 |
| یک | 24,283 | 1.0 |
| سه | 15,869 | 3.0 |
| چهار | 1,358 | 4.0 |
| پنج یا بیشتر | 219 | 5.0 |
| بدون اتاق | 185 | 0.0 |

| Flag | True | False | Null |
|---|---|---|---|
| `has_parking` | 68,238 | 16,345 | 1 |
| `has_elevator` | 63,770 | 20,813 | 1 |
| `has_warehouse` | 76,169 | 8,414 | 1 |

## Distributions (raw, before cleaning)

| Column | q0 | q0.001 | q0.01 | q0.05 | q0.25 | q0.5 | q0.75 | q0.95 | q0.99 | q0.999 | q1 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `price_value` | 1 | 1,111 | 50,000,000 | 1,800,000,000 | 3,594,750,000 | 6,800,000,000 | 12,900,000,000 | 38,000,000,000 | 92,468,000,000 | 6,625,100,000,005 | 90,000,000,000,000 |
| `building_size` | 1 | 30 | 37 | 45 | 60 | 82 | 115 | 190 | 300 | 1,120 | 9,999,999 |
| `ppm2` | 1 | 9 | 293,248 | 28,888,889 | 58,536,585 | 85,000,000 | 121,739,130 | 219,586,355 | 350,000,000 | 76,016,675,325 | 312,280,701,754 |

`ppm2` is `price_value / building_size` for rows with both positive (84,583 rows).

- Rows with `building_size` below 10: 25; above 1000: 96.
- Rows with `price_value` <= 0: 0.
- Rows identical to an earlier row in every kept column: 120.

## Price unit: toman or rial

- Median `price_value / building_size` over 84,259 rows with building_size between 10 and 1000 m2 (from 2024-04): **85,000,000 per m2** (10th to 90th percentile: 41,818,182 to 172,000,000).
- Read as toman, the median is 85.0 million toman per m2. Read as rial, it would be 8.5 million toman per m2.
- Reference assumption (not measured from this data): Tehran apartment asking prices in 2024 were on the order of tens to a few hundred million toman per m2. The toman reading falls in that range; the rial reading, a tenth of it, does not.
- **Conclusion: `price_value` is in toman.** This rests on magnitude plus the reference assumption above; the dataset card does not document the unit.

## Monthly median price per m2

Rows with `price_value > 0` and `building_size > 0`, no other cleaning. Months with few rows are noisy. The data contain only 23 calendar months with any row and 8 with 1,000 or more, so a series of 24 well-populated months is not available; all 29 months of the span are listed.

| Month | Rows | Median price per m2 |
|---|---|---|
| 2022-10 | 1 | 29,375,000 |
| 2022-11 | 0 | n/a |
| 2022-12 | 0 | n/a |
| 2023-01 | 0 | n/a |
| 2023-02 | 0 | n/a |
| 2023-03 | 0 | n/a |
| 2023-04 | 1 | 199,215,686 |
| 2023-05 | 1 | 163,934,426 |
| 2023-06 | 0 | n/a |
| 2023-07 | 4 | 161,789,920 |
| 2023-08 | 2 | 88,088,235 |
| 2023-09 | 2 | 67,070,275 |
| 2023-10 | 3 | 267,460,317 |
| 2023-11 | 12 | 83,212,560 |
| 2023-12 | 15 | 103,809,524 |
| 2024-01 | 37 | 95,652,174 |
| 2024-02 | 41 | 118,400,000 |
| 2024-03 | 85 | 91,525,424 |
| 2024-04 | 651 | 104,705,882 |
| 2024-05 | 10,024 | 87,000,000 |
| 2024-06 | 9,743 | 81,914,894 |
| 2024-07 | 10,117 | 83,000,000 |
| 2024-08 | 9,846 | 84,782,609 |
| 2024-09 | 9,447 | 82,500,000 |
| 2024-10 | 11,028 | 84,753,834 |
| 2024-11 | 11,466 | 85,857,843 |
| 2024-12 | 11,802 | 87,000,000 |
| 2025-01 | 234 | 96,126,358 |
| 2025-02 | 21 | 98,461,538 |

- Across months with 1,000 or more rows (2024-05 to 2024-12), the monthly median ranges from 81,914,894 to 87,000,000 (+0.0% from first to last).

## Coordinate coverage

- Rows with both coordinates: 63,126 (74.63%).
- Rows with coordinates inside latitude 35.55 to 35.85, longitude 51.05 to 51.65: 62,859 (74.32% of subset, 99.58% of rows with coordinates).
- Rows with coordinates outside that box: 267.
- Distinct coordinate pairs: 62,308.
- Share of rows with coordinates by month (months with 1,000 or more rows): 2024-05 51.23%, 2024-06 63.66%, 2024-07 72.39%, 2024-08 77.01%, 2024-09 80.40%, 2024-10 83.63%, 2024-11 83.32%, 2024-12 83.77%.

## Rows per neighborhood

- Distinct `neighborhood_slug` values: 343; null: 0 (0.00%).
- Neighborhoods with at least 30 rows: 295 covering 83,951 rows (99.25%).
- Neighborhoods with fewer than 30 rows: 48 covering 633 rows (0.75%).
- Neighborhoods with at least 100 rows: 199; at least 500: 49.
- Median rows per neighborhood: 121; largest: `poonak` with 2,676.

Top 25 neighborhoods:

| `neighborhood_slug` | Rows | Share |
|---|---|---|
| `poonak` | 2,676 | 3.16% |
| `jeyhoun` | 2,139 | 2.53% |
| `sarsabil` | 1,934 | 2.29% |
| `chitgar-lake` | 1,714 | 2.03% |
| `sazamn-barnameh` | 1,660 | 1.96% |
| `saadat-abad` | 1,523 | 1.80% |
| `south-janat-abad` | 1,445 | 1.71% |
| `kooy-e-ferdos` | 1,346 | 1.59% |
| `west-tehranpars` | 1,317 | 1.56% |
| `andisheh` | 1,286 | 1.52% |
| `central-janat-abad` | 1,276 | 1.51% |
| `shahr-e-ziba` | 1,261 | 1.49% |
| `ostad-moein` | 1,074 | 1.27% |
| `heravi` | 1,029 | 1.22% |
| `tehransar` | 1,019 | 1.20% |
| `west-shahrak-e-golestan` | 989 | 1.17% |
| `qeytariyeh` | 899 | 1.06% |
| `beryanak` | 883 | 1.04% |
| `yousef-abad` | 873 | 1.03% |
| `chitgar` | 863 | 1.02% |
| `niavaran` | 851 | 1.01% |
| `pasdaran` | 832 | 0.98% |
| `zafaraniyeh` | 810 | 0.96% |
| `bagh-feyz` | 792 | 0.94% |
| `azarbaijan` | 773 | 0.91% |
