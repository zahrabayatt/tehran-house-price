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

Reproduce with `python -m training.train`. The block further down is written by that script, including every candidate tried. This section is the reading of it.

### How the choice was made

- Months: train 2024-05 to 2024-09, selection 2024-10, held-out 2024-11 and 2024-12.
- 100 candidates: 20 feature sets by 5 lambda values (0, 10, 100, 1000, 10000). Each was trained with this project's `gradient_descent`, at alpha 0.3 for 5,000 updates, with scaling and the neighborhood lookup from training rows only. All settled and none diverged.
- The candidate with the lowest selection cost, without the penalty term, won. Held-out rows and scikit-learn were not used for any choice. The candidate list was written before any held-out number existed and was not changed after.
- The script ran twice. The second run only added a cost column for the simple rules in the table below. Candidates and code paths for the model were the same, and every number in `model.json` matched except the timestamp and the runtime.
- 285 of the 22,513 held-out rows (1.3%) exactly match a training row. Duplicate removal includes the month by design, so a repeat of the same ad in a later month is kept and can land in the held-out months.
- The final model is the winner trained on the training months only. It was not refit with the selection month, because the lookup and the reported selection cost would then no longer describe it.

### Is it any good?

Mixed, and the site should say so.

- **Typical listing:** the median held-out listing is off by about 1.10 billion toman, or 15.6% of its price. One listing in ten is off by more than 58.5% of its price.
- **It does not beat the simplest location rule on a typical listing.** Area × neighborhood median, with no training at all, has a smaller median gap (0.96 billion, 14.2%) and a much smaller 90th percentile share (45.3%). The trained model wins clearly on cost (18.28 against 28.13) and slightly on the 90th percentile in billions (5.74 against 5.86). This comes from the squared cost, which weights a miss of 20 billion on a luxury flat 400 times as much as a miss of 1 billion on an ordinary one, so the fit serves expensive listings at the expense of cheap ones.
- **Cheap flats are overestimated and expensive ones underestimated.** Under 3 billion the median gap is 38.8% of the price and the median difference is +0.37 billion. At 25 billion and up the median difference is -3.21 billion.
- **Predictions can be zero or negative.** That happened for 30 of 22,513 held-out listings, the lowest being -1.14 billion. A small, old flat without amenities in the cheapest neighborhood gets -2.42 billion. The site must not show these as prices.
- **Costs drift up with time:** train 16.07, selection 17.04, held-out 18.28. Training cost is also a little flattered, because each training row helped set its own neighborhood's median.

This comparison was made after the held-out look, so it cannot be used to pick a different model from these months without losing the claim that held-out data was untouched. Modeling a different target, such as price per m², would need new held-out data or an openly labeled second look.

### What not to read into the weights

Per unit, with everything else held fixed, an elevator lowers the estimate by 0.84 billion, parking by 0.11 billion and each room by 0.29 billion, while each year of age lowers it by 0.16 billion. Storage adds 0.12 billion. These are not the value of an elevator or a parking space. The fields overlap heavily with each other, with area, and with the neighborhood term, and asking prices are not controlled comparisons. The `area` weight is also negative, and only makes sense together with `area^2` and `location`.

The lambda choice is close to a tie: 17.0441 at lambda 100 against 17.0652 at lambda 0, a 0.12% difference on one month of data. On held-out data, scikit-learn with no penalty came out 0.07% lower (18.2695 against 18.2830). That was not acted on. Ridge with the same lambda matches this project's descent to ten decimal places, which is the check that descent reached the true minimum.

### Limits of the map

The map uses Tehran's official neighborhoods from OpenStreetMap (admin_level 11, ODbL; the boundary file in `data/osm/` records its OSM date). An ad belongs to the neighborhood whose boundary contains its coordinates. 61,152 of the 81,603 cleaned ads have coordinates, and 60,076 of those fall inside one of the 377 neighborhoods. 339 neighborhoods have at least 15 ads, enough to show a median price and to be chosen on the Estimate page.

The model was trained on Divar's own neighborhood names, so each official neighborhood hands the model the Divar name most of its ads use. For 37 of the 339, that Divar name has fewer than 30 training ads, so the model uses the Tehran median there. The "similar ads then" range on the Estimate page comes from the November and December ads inside the chosen neighborhood; only the middle half of their prices is shown, never a single ad.

<!-- training results: written by training/train.py -->
### Chosen model and held-out result (generated)

Features: `area, location, rooms, age, parking, elevator, storage, area^2, location^2`. Lambda 100, alpha 0.3, 5,000 updates. Rows: 48,332 train, 10,758 selection, 22,513 held-out.

| Cost, no penalty (billion toman squared, halved) | Value |
|---|---|
| Train | 16.0745 |
| Selection, 2024-10 | 17.0441 |
| Held-out, 2024-11 and 2024-12 | 18.2830 |
| scikit-learn LinearRegression, same features, held-out | 18.2695 |
| scikit-learn Ridge, same features and lambda, held-out | 18.2830 |

How far off on held-out listings, with simpler rules for comparison. None of these rows fed into any choice.

| Predictor | Cost | Median gap (billions) | Median gap (share of price) | 90th percentile gap (billions) | 90th percentile gap (share) |
|---|---|---|---|---|---|
| This model | 18.2830 | 1.10 | 15.6% | 5.74 | 58.5% |
| Always the training median price | 144.1103 | 3.72 | 56.6% | 18.30 | 168.0% |
| Area × Tehran median per m² | 87.8446 | 2.18 | 35.3% | 12.58 | 92.2% |
| Area × neighborhood median per m² | 28.1284 | 0.96 | 14.2% | 5.86 | 45.3% |

Gap by asked price on held-out listings:

| Asked price (billions) | Listings | Median gap (billions) | Median gap (share) | Median signed difference, model minus asked (billions) |
|---|---|---|---|---|
| 0 to 3 | 3,627 | 0.88 | 38.8% | +0.37 |
| 3 to 6 | 5,873 | 0.74 | 17.8% | +0.06 |
| 6 to 12 | 6,577 | 0.99 | 12.0% | -0.14 |
| 12 to 25 | 4,151 | 1.76 | 10.8% | -0.57 |
| 25 and up | 2,285 | 7.53 | 18.7% | -3.21 |

Held-out predictions at or below zero: 30 of 22,513.

### All candidates tried (generated)

Every candidate used alpha 0.3 and 5,000 updates. Sorted by selection cost, the only thing that decided the choice. "Settled" means the cost moved by under one part in ten million over the last 100 updates.

| Features | Lambda | Selection cost | Train cost | Settled | Chosen |
|---|---|---|---|---|---|
| area, location, rooms, age, parking, elevator, storage, area^2, location^2 | 100 | 17.0441 | 16.0745 | yes | **yes** |
| area, location, rooms, age, parking, elevator, storage, area^2, location^2 | 10 | 17.0624 | 16.0700 | yes |  |
| area, location, rooms, age, parking, elevator, storage, area^2, location^2 | 0 | 17.0652 | 16.0700 | yes |  |
| area, location, rooms, age, parking, elevator, storage, area^2, location^2 | 1000 | 17.0716 | 16.2111 | yes |  |
| area, location, rooms, age, parking, elevator, storage, location^2 | 100 | 17.2904 | 16.4060 | yes |  |
| area, location, rooms, age, parking, elevator, storage, location^2 | 10 | 17.2956 | 16.4053 | yes |  |
| area, location, rooms, age, parking, elevator, storage, location^2 | 0 | 17.2963 | 16.4053 | yes |  |
| area, location, rooms, age, parking, elevator, storage, area^2 | 0 | 17.2971 | 16.1313 | yes |  |
| area, location, rooms, age, parking, elevator, storage, area^2 | 10 | 17.2993 | 16.1314 | yes |  |
| area, location, rooms, age, parking, elevator, storage, location^2 | 1000 | 17.3114 | 16.4550 | yes |  |
| area, location, rooms, age, parking, elevator, storage, area^2 | 100 | 17.3209 | 16.1337 | yes |  |
| area, location, rooms, age, parking, elevator, storage, area^2 | 1000 | 17.5997 | 16.2715 | yes |  |
| location, location^2, rooms, age, parking, elevator, storage | 100 | 18.0360 | 17.0691 | yes |  |
| location, location^2, rooms, age, parking, elevator, storage | 10 | 18.0423 | 17.0681 | yes |  |
| location, location^2, rooms, age, parking, elevator, storage | 0 | 18.0432 | 17.0681 | yes |  |
| location, location^2, rooms, age, parking, elevator, storage | 1000 | 18.0650 | 17.1379 | yes |  |
| area, location, rooms, age, parking, elevator, storage, area^2, location^2 | 10000 | 18.4962 | 17.4765 | yes |  |
| area, location, rooms, age, parking, elevator, storage, location^2 | 10000 | 18.7421 | 17.5252 | yes |  |
| location, location^2 | 1000 | 19.1020 | 18.0030 | yes |  |
| location, location^2 | 100 | 19.1214 | 17.9537 | yes |  |
| location, location^2 | 10 | 19.1301 | 17.9530 | yes |  |
| location, location^2 | 0 | 19.1312 | 17.9530 | yes |  |
| area, location, rooms, age, parking, elevator, storage | 0 | 19.1929 | 17.3857 | yes |  |
| area, location, rooms, age, parking, elevator | 0 | 19.1937 | 17.3874 | yes |  |
| area, location, rooms, age, parking, elevator, storage | 10 | 19.1944 | 17.3858 | yes |  |
| area, location, rooms, age, parking, elevator | 10 | 19.1952 | 17.3874 | yes |  |
| area, location, rooms, age, parking, elevator, storage | 100 | 19.2083 | 17.3866 | yes |  |
| area, location, rooms, age, parking, elevator | 100 | 19.2091 | 17.3882 | yes |  |
| area, location, rooms, age, elevator, storage | 0 | 19.2316 | 17.4136 | yes |  |
| area, location, rooms, age, elevator, storage | 10 | 19.2331 | 17.4136 | yes |  |
| area, location, rooms, age, elevator, storage | 100 | 19.2471 | 17.4145 | yes |  |
| area, location, rooms, age, parking, storage | 0 | 19.4024 | 17.5306 | yes |  |
| area, location, rooms, age, parking, elevator, storage | 1000 | 19.4034 | 17.4564 | yes |  |
| area, location, rooms, age, parking, storage | 10 | 19.4038 | 17.5306 | yes |  |
| area, location, rooms, age, parking, elevator | 1000 | 19.4041 | 17.4576 | yes |  |
| area, location, rooms, age, parking, storage | 100 | 19.4170 | 17.5314 | yes |  |
| area, location, rooms, age, elevator, storage | 1000 | 19.4425 | 17.4845 | yes |  |
| area, location, rooms, age, parking, storage | 1000 | 19.6024 | 17.5984 | yes |  |
| area, location, age, parking, elevator, storage | 0 | 19.8082 | 17.7727 | yes |  |
| area, location, age, parking, elevator, storage | 10 | 19.8096 | 17.7727 | yes |  |
| area, location, age, parking, elevator, storage | 100 | 19.8230 | 17.7738 | yes |  |
| location, location^2, rooms, age, parking, elevator, storage | 10000 | 19.8482 | 18.5775 | yes |  |
| area, location, age, parking, elevator, storage | 1000 | 20.0182 | 17.8592 | yes |  |
| location, rooms, age, parking, elevator, storage | 0 | 20.0901 | 18.1613 | yes |  |
| location, rooms, age, parking, elevator, storage | 10 | 20.0921 | 18.1613 | yes |  |
| area, location, rooms, parking, elevator, storage | 0 | 20.0925 | 18.0588 | yes |  |
| area, location, rooms, parking, elevator, storage | 10 | 20.0937 | 18.0588 | yes |  |
| area, location, rooms, parking, elevator, storage | 100 | 20.1054 | 18.0595 | yes |  |
| location, rooms, age, parking, elevator, storage | 100 | 20.1103 | 18.1621 | yes |  |
| location, age, parking, elevator, storage | 0 | 20.1445 | 18.1753 | yes |  |
| location, age, parking, elevator, storage | 10 | 20.1458 | 18.1753 | yes |  |
| location, age, parking, elevator, storage | 100 | 20.1583 | 18.1758 | yes |  |
| area, location, rooms, parking, elevator, storage | 1000 | 20.2713 | 18.1184 | yes |  |
| location, age, parking, elevator, storage | 1000 | 20.3223 | 18.2236 | yes |  |
| location, rooms, age, parking, elevator, storage | 1000 | 20.3477 | 18.2352 | yes |  |
| location, rooms, age | 0 | 20.4070 | 18.3907 | yes |  |
| location, rooms, age | 10 | 20.4088 | 18.3908 | yes |  |
| location, rooms, age | 100 | 20.4258 | 18.3915 | yes |  |
| location, age | 0 | 20.5384 | 18.4390 | yes |  |
| location, age | 10 | 20.5395 | 18.4390 | yes |  |
| location, age | 100 | 20.5493 | 18.4394 | yes |  |
| location, rooms, age | 1000 | 20.6483 | 18.4610 | yes |  |
| location, age | 1000 | 20.6798 | 18.4773 | yes |  |
| area, location, rooms, age, parking, elevator, storage, area^2 | 10000 | 20.6836 | 18.7149 | yes |  |
| location, location^2 | 10000 | 20.7838 | 19.5677 | yes |  |
| location, area | 0 | 20.8567 | 18.5499 | yes |  |
| location, area | 10 | 20.8577 | 18.5499 | yes |  |
| location, area | 100 | 20.8677 | 18.5508 | yes |  |
| location, area | 1000 | 21.0198 | 18.6213 | yes |  |
| location, parking, elevator, storage | 0 | 21.3435 | 19.0869 | yes |  |
| location, parking, elevator, storage | 10 | 21.3446 | 19.0869 | yes |  |
| location, parking, elevator, storage | 100 | 21.3551 | 19.0874 | yes |  |
| location | 0 | 21.3595 | 19.1102 | yes |  |
| location | 10 | 21.3606 | 19.1102 | yes |  |
| location | 100 | 21.3705 | 19.1106 | yes |  |
| location, parking, elevator, storage | 1000 | 21.4965 | 19.1304 | yes |  |
| location | 1000 | 21.5021 | 19.1492 | yes |  |
| area, location, age, parking, elevator, storage | 10000 | 22.8845 | 20.0744 | yes |  |
| area, location, rooms, age, parking, elevator | 10000 | 22.8846 | 20.0715 | yes |  |
| area, location, rooms, age, parking, elevator, storage | 10000 | 22.8870 | 20.0765 | yes |  |
| area, location, rooms, age, elevator, storage | 10000 | 22.9254 | 20.1081 | yes |  |
| area, location, rooms, age, parking, storage | 10000 | 22.9744 | 20.1457 | yes |  |
| location, area | 10000 | 23.4361 | 20.5143 | yes |  |
| area, location, rooms, parking, elevator, storage | 10000 | 23.4749 | 20.5465 | yes |  |
| location, age | 10000 | 24.1558 | 21.1757 | yes |  |
| location, age, parking, elevator, storage | 10000 | 24.3012 | 21.3006 | yes |  |
| location, rooms, age, parking, elevator, storage | 10000 | 24.9771 | 21.7946 | yes |  |
| location | 10000 | 25.0290 | 21.9005 | yes |  |
| location, rooms, age | 10000 | 25.0326 | 21.8381 | yes |  |
| location, parking, elevator, storage | 10000 | 25.1932 | 22.0245 | yes |  |
| area, rooms, age, parking, elevator, storage | 0 | 33.4441 | 31.2878 | yes |  |
| area, rooms, age, parking, elevator, storage | 10 | 33.4476 | 31.2878 | yes |  |
| area, rooms, age, parking, elevator, storage | 100 | 33.4798 | 31.2897 | yes |  |
| area, rooms, age, parking, elevator, storage | 1000 | 33.9143 | 31.4506 | yes |  |
| area | 0 | 36.2100 | 33.2676 | yes |  |
| area | 10 | 36.2109 | 33.2676 | yes |  |
| area | 100 | 36.2200 | 33.2680 | yes |  |
| area | 1000 | 36.3379 | 33.3008 | yes |  |
| area | 10000 | 39.3818 | 35.6418 | yes |  |
| area, rooms, age, parking, elevator, storage | 10000 | 40.3323 | 36.5037 | yes |  |
<!-- end of training results -->
