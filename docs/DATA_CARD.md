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

Titles, descriptions, user fields and coordinates are not in the frame returned by `clean`. Latitude and longitude exist only in `clean_with_coords` (as `lat`, `lon`), which is used only to place ads in official neighborhoods for the map (`training/neighborhoods.py`) and is never shipped.

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

- **Low, 12.** Below 12 are 1,260 rows (1.5%); 894 of them are under 1 million toman per m2 (prices such as 1, 111, 1,111, or a few hundred million entered for a whole flat). The count per million toman falls to its minimum in the 10 to 12 band (about 24 rows per million) and climbs to about 83 in 12 to 15, where real cheap apartments begin. Bounds are inclusive, so the 5 rows with a price per m2 of exactly 12 are kept; that is why the range table shows 1,265 rows "up to 12" while 1,260 are removed. The 1st percentile of the raw column is 0.26 million toman per m2, the 5th is 29.
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
- The raw subset spans 2022-10 to 2025-02, but only eight months are dense (2024-05 to 2024-12), so no seasonality or long-run trend can be learned. Median price per m2 is nearly flat across the window: 81.9 to 87.0 million toman in the raw rows, and 82.4 to 88.0 after cleaning.
- `age` is capped at 34 by the "before 1370" bucket, so it hides older buildings.
- The market ends in December 2024, the last month in the window.
- Coordinates are present for 51% of rows in 2024-05 and 84% by 2024-12, so location features built from them cover later months better.
- A neighborhood slug is the site's label and may mix areas of different price level.

## Model and honest result

Reproduce with `python -m training.train`. The block further down is written by that script, including every candidate tried. This section is the reading of it. The model is version 2; version 1 is kept below for the record.

### How the choice was made

- Months: train 2024-05 to 2024-09, selection 2024-10, held-out 2024-11 and 2024-12.
- The model predicts the natural log of the asking price in billions, and an estimate is exp of its output. Area and location enter as logs too, and squared terms are squares of the logs.
- 100 candidates: 20 feature sets by 5 lambda values (0, 10, 100, 1000, 10000). Each was trained with this project's `gradient_descent`, at alpha 0.3 for 5,000 updates, with scaling and the neighborhood lookup from training rows only. None diverged.
- Four candidates, the winner among them, had not fully settled after 5,000 updates: log(area) and log(area)^2 move almost together, which makes descent slow in one direction. Solved exactly with least squares, the same candidate still has the lowest selection cost (0.046717 against 0.046730 for the next), and scikit-learn's exact held-out cost differs from the descent's by 0.004%.
- The candidate with the lowest selection cost on log prices, without the penalty term, won. Held-out rows and scikit-learn were not used for any choice.
- 285 of the 22,513 held-out rows (1.3%) exactly match a training row. Duplicate removal includes the month by design, so a repeat of the same ad in a later month is kept and can land in the held-out months.
- The final model is the winner trained on the training months only. It was not refit with the selection month, because the lookup and the reported selection cost would then no longer describe it.

### Why log price (version 2)

Version 1, trained on 2026-11-03, predicted the price in billions with the same candidate list written without logs. Its squared cost weighted a miss of 20 billion on a luxury flat 400 times as much as a miss of 1 billion on an ordinary one, so the fit served expensive listings and left cheap ones with large misses as a share of their price: under 3 billion its median gap was 38.8% of the price.

After version 1's held-out look, `training/compare_targets.py` compared three targets on October only. Each trained the same 100 candidates and kept its own best on October; November and December were not used:

| Target | October median gap (share) | October 90th percentile gap (share) | October cost in billions |
|---|---|---|---|
| Price (version 1) | 15.7% | 56.8% | 17.04 |
| Log price, same inputs | 17.9% | 56.1% | 42.21 |
| Log price, log area and log location (version 2) | 11.5% | 38.3% | 16.57 |

Log price alone was worse: a straight line cannot connect plain area to log price. With logs on both sides the relationship is close to straight, since log(price) is about log(area) + log(price per m2). Version 2 won on every column and was adopted on that basis.

**A second look at the held-out months.** Version 1 had already been scored on November and December. Version 2 was chosen on October alone, but its held-out numbers below are a second look at the same months, not a fresh test. Any further change chosen from these months would need new held-out data.

### Is it any good?

Better than version 1, and the site should still say where it misses.

- **Typical listing:** the median held-out listing is off by about 0.82 billion toman, or 12.1% of its price. One listing in ten is off by more than 40.1% of its price. Version 1: 1.10 billion, 15.6%, and 58.5%.
- **It now beats the simplest location rule.** Area × neighborhood median, with no training at all, has a median gap of 0.96 billion (14.2%), a 90th percentile share of 45.3% and a cost of 28.13. The model has 12.1%, 40.1% and 18.25. Version 1 lost to this rule on a typical listing.
- **Cheap flats improved most; the dearest got a little worse.** Under 3 billion the median gap is 14.5% (version 1: 38.8%). At 25 billion and up it is 21.0%, and the median difference is -5.23 billion (version 1: -3.21), so expensive flats are underestimated more than before.
- **Estimates are always above zero.** exp cannot give zero or less. Version 1 gave 30 held-out listings a price at or below zero.
- **Costs on log prices:** train 0.0471, selection 0.0467, held-out 0.0496. Training cost is a little flattered, because each training row helped set its own neighborhood's median.

### What not to read into the weights

On the log scale a weight is a share, not an amount. Per unit, with everything else held fixed, an elevator raises the estimate by 11.7%, parking by 9.3% and each room by 1.8%, while each year of age lowers it by 0.19% and storage by 0.5%. These are not the value of an elevator or a parking space. The fields overlap heavily with each other, with area, and with the neighborhood term, and asking prices are not controlled comparisons. The `log(area)` weight is negative and only makes sense together with `log(area)^2` and `log(location)`.

The lambda choice is a tie: lambda 0 and lambda 10 differ in the fifth decimal of the selection cost. With 48,332 training ads and eight features there is little for a penalty to fix.

### Limits of the map

The map uses Tehran's official neighborhoods from OpenStreetMap (admin_level 11, ODbL; the boundary file in `data/osm/` records its OSM date). An ad belongs to the neighborhood whose boundary contains its coordinates. 61,152 of the 81,603 cleaned ads have coordinates, and 60,076 of those fall inside one of the 377 neighborhoods. 339 neighborhoods have at least 15 ads, enough to show a median price and to be chosen on the Estimate page.

The model was trained on Divar's own neighborhood names, so each official neighborhood hands the model the Divar name most of its ads use. For 37 of the 339, that Divar name has fewer than 30 training ads, so the model uses the Tehran median there. The "similar ads then" range on the Estimate page comes from the November and December ads inside the chosen neighborhood; only the middle half of their prices is shown, never a single ad.

<!-- training results: written by training/train.py -->
### Chosen model and held-out result (generated)

Target: the natural log of the asking price in billions. An estimate is exp of the model's output, so it is always above zero.

Features: `log(area), log(location), rooms, age, parking, elevator, storage, log(area)^2`. Lambda 0, alpha 0.3, 5,000 updates. Rows: 48,332 train, 10,758 selection, 22,513 held-out.

| Cost, no penalty | On log prices (what chose the model) | On prices in billions, after exp (billion toman squared, halved) |
|---|---|---|
| Train | 0.0471 | 16.2000 |
| Selection, 2024-10 | 0.0467 | 16.5666 |
| Held-out, 2024-11 and 2024-12 | 0.0496 | 18.2512 |
| scikit-learn LinearRegression, same features, held-out | 0.0496 | |

How far off on held-out listings, with version 1 and simpler rules for comparison. Version 2 was chosen on October alone. Version 1 had already been scored on these months, so the version 2 row is a second look at them. None of the other rows fed into any choice.

| Predictor | Cost in billions | Median gap (billions) | Median gap (share of price) | 90th percentile gap (billions) | 90th percentile gap (share) |
|---|---|---|---|---|---|
| This model (version 2, log price) | 18.2512 | 0.82 | 12.1% | 5.60 | 40.1% |
| Version 1 (price in billions, trained 2026-11-03) | 18.2830 | 1.10 | 15.6% | 5.74 | 58.5% |
| Always the training median price | 144.1103 | 3.72 | 56.6% | 18.30 | 168.0% |
| Area × Tehran median per m² | 87.8446 | 2.18 | 35.3% | 12.58 | 92.2% |
| Area × neighborhood median per m² | 28.1284 | 0.96 | 14.2% | 5.86 | 45.3% |

Gap by asked price on held-out listings:

| Asked price (billions) | Listings | Median gap (billions) | Median gap (share) | Median signed difference, model minus asked (billions) |
|---|---|---|---|---|
| 0 to 3 | 3,627 | 0.34 | 14.5% | +0.23 |
| 3 to 6 | 5,873 | 0.42 | 10.1% | -0.08 |
| 6 to 12 | 6,577 | 0.86 | 10.4% | -0.41 |
| 12 to 25 | 4,151 | 2.22 | 14.0% | -1.46 |
| 25 and up | 2,285 | 8.19 | 21.0% | -5.23 |

### All candidates tried (generated)

Every candidate used alpha 0.3 and 5,000 updates. Sorted by selection cost on log prices, the only thing that decided the choice. "Settled" means the cost moved by under one part in ten million over the last 100 updates.

| Features | Lambda | Selection cost (log) | Train cost (log) | Settled | Chosen |
|---|---|---|---|---|---|
| log(area), log(location), rooms, age, parking, elevator, storage, log(area)^2 | 0 | 0.04672 | 0.04709 | no | **yes** |
| log(area), log(location), rooms, age, parking, elevator, storage, log(area)^2 | 10 | 0.04673 | 0.04709 | no |  |
| log(area), log(location), rooms, age, parking, elevator, storage, log(area)^2, log(location)^2 | 0 | 0.04678 | 0.04710 | no |  |
| log(area), log(location), rooms, age, parking, elevator, storage, log(area)^2, log(location)^2 | 10 | 0.04680 | 0.04711 | no |  |
| log(area), log(location), rooms, age, parking, elevator, storage, log(area)^2 | 100 | 0.04694 | 0.04728 | yes |  |
| log(area), log(location), rooms, age, parking, elevator, storage, log(area)^2, log(location)^2 | 100 | 0.04698 | 0.04724 | yes |  |
| log(area), log(location), rooms, age, parking, elevator, storage, log(location)^2 | 0 | 0.04712 | 0.04738 | yes |  |
| log(area), log(location), rooms, age, parking, elevator, storage, log(location)^2 | 10 | 0.04712 | 0.04738 | yes |  |
| log(area), log(location), rooms, age, parking, elevator, storage, log(location)^2 | 100 | 0.04716 | 0.04739 | yes |  |
| log(location), log(location)^2, rooms, age, parking, elevator, storage | 0 | 0.04747 | 0.04778 | yes |  |
| log(location), log(location)^2, rooms, age, parking, elevator, storage | 10 | 0.04747 | 0.04778 | yes |  |
| log(location), log(location)^2, rooms, age, parking, elevator, storage | 100 | 0.04750 | 0.04778 | yes |  |
| log(area), log(location), age, parking, elevator, storage | 0 | 0.04760 | 0.04802 | yes |  |
| log(area), log(location), age, parking, elevator, storage | 10 | 0.04760 | 0.04802 | yes |  |
| log(area), log(location), rooms, age, parking, elevator, storage, log(area)^2, log(location)^2 | 1000 | 0.04761 | 0.04767 | yes |  |
| log(area), log(location), rooms, age, parking, elevator, storage, log(location)^2 | 1000 | 0.04762 | 0.04768 | yes |  |
| log(area), log(location), rooms, age, parking, elevator | 0 | 0.04762 | 0.04801 | yes |  |
| log(area), log(location), rooms, age, parking, elevator | 10 | 0.04762 | 0.04801 | yes |  |
| log(area), log(location), rooms, age, parking, elevator, storage | 0 | 0.04762 | 0.04800 | yes |  |
| log(area), log(location), rooms, age, parking, elevator, storage | 10 | 0.04763 | 0.04800 | yes |  |
| log(area), log(location), age, parking, elevator, storage | 100 | 0.04763 | 0.04802 | yes |  |
| log(area), log(location), rooms, age, parking, elevator | 100 | 0.04765 | 0.04801 | yes |  |
| log(area), log(location), rooms, age, parking, elevator, storage | 100 | 0.04765 | 0.04801 | yes |  |
| log(area), log(location), rooms, parking, elevator, storage | 0 | 0.04783 | 0.04811 | yes |  |
| log(area), log(location), rooms, parking, elevator, storage | 10 | 0.04783 | 0.04811 | yes |  |
| log(area), log(location), rooms, parking, elevator, storage | 100 | 0.04786 | 0.04811 | yes |  |
| log(area), log(location), rooms, age, elevator, storage | 0 | 0.04792 | 0.04827 | yes |  |
| log(area), log(location), rooms, age, elevator, storage | 10 | 0.04792 | 0.04827 | yes |  |
| log(area), log(location), rooms, age, parking, elevator, storage, log(area)^2 | 1000 | 0.04794 | 0.04807 | yes |  |
| log(area), log(location), rooms, age, elevator, storage | 100 | 0.04795 | 0.04828 | yes |  |
| log(area), log(location), rooms, age, parking, storage | 0 | 0.04796 | 0.04846 | yes |  |
| log(area), log(location), rooms, age, parking, storage | 10 | 0.04796 | 0.04846 | yes |  |
| log(location), log(location)^2, rooms, age, parking, elevator, storage | 1000 | 0.04796 | 0.04806 | yes |  |
| log(area), log(location), rooms, age, parking, storage | 100 | 0.04799 | 0.04846 | yes |  |
| log(area), log(location), age, parking, elevator, storage | 1000 | 0.04811 | 0.04831 | yes |  |
| log(location), rooms, age, parking, elevator, storage | 0 | 0.04811 | 0.04856 | yes |  |
| log(location), rooms, age, parking, elevator, storage | 10 | 0.04811 | 0.04856 | yes |  |
| log(location), rooms, age, parking, elevator, storage | 100 | 0.04814 | 0.04856 | yes |  |
| log(area), log(location), rooms, age, parking, elevator, storage | 1000 | 0.04817 | 0.04831 | yes |  |
| log(area), log(location), rooms, age, parking, elevator | 1000 | 0.04817 | 0.04831 | yes |  |
| log(area), log(location), rooms, parking, elevator, storage | 1000 | 0.04831 | 0.04839 | yes |  |
| log(location), age, parking, elevator, storage | 0 | 0.04836 | 0.04914 | yes |  |
| log(location), age, parking, elevator, storage | 10 | 0.04836 | 0.04914 | yes |  |
| log(location), age, parking, elevator, storage | 100 | 0.04838 | 0.04914 | yes |  |
| log(area), log(location), rooms, age, elevator, storage | 1000 | 0.04848 | 0.04858 | yes |  |
| log(area), log(location), rooms, age, parking, storage | 1000 | 0.04850 | 0.04877 | yes |  |
| log(location), rooms, age, parking, elevator, storage | 1000 | 0.04861 | 0.04880 | yes |  |
| log(location), age, parking, elevator, storage | 1000 | 0.04866 | 0.04930 | yes |  |
| log(location), parking, elevator, storage | 0 | 0.04881 | 0.04943 | yes |  |
| log(location), parking, elevator, storage | 10 | 0.04881 | 0.04943 | yes |  |
| log(location), parking, elevator, storage | 100 | 0.04883 | 0.04943 | yes |  |
| log(location), rooms, age | 0 | 0.04896 | 0.04950 | yes |  |
| log(location), rooms, age | 10 | 0.04896 | 0.04950 | yes |  |
| log(location), rooms, age | 100 | 0.04899 | 0.04950 | yes |  |
| log(location), parking, elevator, storage | 1000 | 0.04909 | 0.04958 | yes |  |
| log(location), age | 0 | 0.04923 | 0.05013 | yes |  |
| log(location), age | 10 | 0.04924 | 0.05013 | yes |  |
| log(location), age | 100 | 0.04925 | 0.05014 | yes |  |
| log(location), rooms, age | 1000 | 0.04947 | 0.04973 | yes |  |
| log(location), age | 1000 | 0.04952 | 0.05027 | yes |  |
| log(location), log(area) | 0 | 0.04973 | 0.04994 | yes |  |
| log(location), log(area) | 10 | 0.04973 | 0.04994 | yes |  |
| log(location), log(area) | 100 | 0.04975 | 0.04995 | yes |  |
| log(location), log(area) | 1000 | 0.05015 | 0.05019 | yes |  |
| log(location), log(location)^2 | 0 | 0.05111 | 0.05149 | yes |  |
| log(location), log(location)^2 | 10 | 0.05111 | 0.05149 | yes |  |
| log(location), log(location)^2 | 100 | 0.05116 | 0.05151 | yes |  |
| log(location) | 0 | 0.05148 | 0.05204 | yes |  |
| log(location) | 10 | 0.05148 | 0.05204 | yes |  |
| log(location) | 100 | 0.05149 | 0.05204 | yes |  |
| log(location), log(location)^2 | 1000 | 0.05174 | 0.05190 | yes |  |
| log(location) | 1000 | 0.05178 | 0.05218 | yes |  |
| log(area), log(location), rooms, age, parking, elevator, storage, log(location)^2 | 10000 | 0.05184 | 0.05129 | yes |  |
| log(location), log(location)^2, rooms, age, parking, elevator, storage | 10000 | 0.05231 | 0.05176 | yes |  |
| log(area), log(location), rooms, age, parking, elevator, storage, log(area)^2, log(location)^2 | 10000 | 0.05232 | 0.05180 | yes |  |
| log(area), log(location), age, parking, elevator, storage | 10000 | 0.05585 | 0.05539 | yes |  |
| log(location), log(location)^2 | 10000 | 0.05654 | 0.05609 | yes |  |
| log(area), log(location), rooms, parking, elevator, storage | 10000 | 0.05734 | 0.05661 | yes |  |
| log(area), log(location), rooms, age, parking, elevator, storage | 10000 | 0.05737 | 0.05661 | yes |  |
| log(area), log(location), rooms, age, parking, elevator | 10000 | 0.05738 | 0.05657 | yes |  |
| log(location), log(area) | 10000 | 0.05758 | 0.05695 | yes |  |
| log(area), log(location), rooms, age, parking, elevator, storage, log(area)^2 | 10000 | 0.05760 | 0.05695 | yes |  |
| log(area), log(location), rooms, age, elevator, storage | 10000 | 0.05777 | 0.05689 | yes |  |
| log(area), log(location), rooms, age, parking, storage | 10000 | 0.05795 | 0.05732 | yes |  |
| log(location), rooms, age, parking, elevator, storage | 10000 | 0.05926 | 0.05835 | yes |  |
| log(location), age, parking, elevator, storage | 10000 | 0.05931 | 0.05910 | yes |  |
| log(location), parking, elevator, storage | 10000 | 0.05952 | 0.05923 | yes |  |
| log(location), age | 10000 | 0.06014 | 0.05989 | yes |  |
| log(location), rooms, age | 10000 | 0.06056 | 0.05949 | yes |  |
| log(location) | 10000 | 0.06270 | 0.06201 | yes |  |
| log(area), rooms, age, parking, elevator, storage | 0 | 0.09670 | 0.09708 | yes |  |
| log(area), rooms, age, parking, elevator, storage | 10 | 0.09670 | 0.09708 | yes |  |
| log(area), rooms, age, parking, elevator, storage | 100 | 0.09674 | 0.09709 | yes |  |
| log(area), rooms, age, parking, elevator, storage | 1000 | 0.09742 | 0.09746 | yes |  |
| log(area) | 0 | 0.10262 | 0.10328 | yes |  |
| log(area) | 10 | 0.10263 | 0.10328 | yes |  |
| log(area) | 100 | 0.10264 | 0.10328 | yes |  |
| log(area) | 1000 | 0.10287 | 0.10340 | yes |  |
| log(area), rooms, age, parking, elevator, storage | 10000 | 0.10761 | 0.10659 | yes |  |
| log(area) | 10000 | 0.11211 | 0.11174 | yes |  |
<!-- end of training results -->
