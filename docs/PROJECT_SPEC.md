# Tehran House Price Estimator: Project Spec

Design date: 2026-11-01. Requirements source: the course reference notes kept outside this repository. Where this spec is more specific than those notes, this spec wins.

This file keeps the parts of the shared design that apply to this repository. The air quality predictor (logistic regression) is a separate project in its own repository, `tehran-air-risk`, with its own spec. It is not part of this site.

## 1. Intent

A public, working portfolio site that demonstrates what the author learned in **Course 1 of the Machine Learning Specialization** (Supervised Machine Learning: Regression and Classification), applied to a real Tehran question with real data, and honest about its limits. The regression half of the course is used here.

Audience: recruiters and technical reviewers first; curious non-technical visitors second.

Success means:

- The site is live on a public URL and the repository is public.
- A non-technical visitor understands the prediction and its limits without reading any math.
- A reviewer can inspect the data, math, training, plots, and real code for every concept used.
- Educational controls cannot change the deployed model.
- The author can explain every part in an interview.

## 2. Decisions

| Topic | Decision |
|---|---|
| Course scope | The linear regression part of Course 1 |
| Out of scope | Accuracy, Precision, Recall, F1, Confusion Matrix, ROC-AUC, MSE, RMSE, L1 loss, L2 loss, and algorithms beyond linear regression |
| UI language | English only |
| Repository | `tehran-house-price` |
| Hosting | GitHub Pages. No server-side need exists in this design |

## 3. Architecture

```text
Offline Python training --> model/model.json --> static React site (prediction runs in browser)
```

- **Training:** Python 3.10+, NumPy from-scratch gradient descent, pandas for preparation, scikit-learn only as a comparison check. Dependencies pinned.
- **Site:** Vite, React, TypeScript. `HashRouter`, so deep links work on Pages. KaTeX for math. SVG charts.
- **Model file:** `model.json` holds feature names and order, weights, bias, scaling means and standard deviations, engineered-feature lookup data, chosen hyperparameters, train and held-out cost, downsampled cost history, row counts, data date range, training timestamp, measured training runtime, and environment (Python and NumPy versions, OS).

## 4. Data and model

### Data

- Source: `divarofficial/real_estate_ads` on Hugging Face, ODbL, 1,000,000 ads, `created_at_month` from 2020-02 to 2025-03, 190,904 Tehran rows across all categories. The download script pins a dataset revision.
- Filter: `city_slug = tehran`, `cat3_slug = apartment-sell`, `price_mode = مقطوع`.
- Time window: 2024-05 through 2024-12. Profiling showed 98.7% of the filtered rows fall in these months, with a flat monthly median, and later months are too sparse to evaluate on. Recorded in `DATA_CARD.md`.
- Minimum: at least 5,000 rows after cleaning. Below that, widen the window and record the change.
- Cleaning, each step with counts reported: remove exact duplicates, invalid prices and areas, and implausible price-per-square-meter values. Numeric bounds are chosen from the observed distribution and documented. Persian digits, room words, and `قبل از ۱۳۷۰` (before 1370) are converted to numbers.
- Currency: confirm the unit of `price_value` from the data before labeling anything.

### Model

- Target: advertised asking price, in billions of the verified currency unit.
- Candidate features: area, rooms, building age, parking, elevator, storage. Keep or drop each using selection-set cost and data quality.
- Engineered feature: `area × neighborhood_median_price_per_m2`. Medians use training rows only. A neighborhood with fewer than 30 training rows uses the Tehran training median.
- Lab experiments: polynomial terms and a squared penalty on the weights (regularization). These enter the deployed model only if they lower selection-set cost.
- Split, in time order: the final 2 months are the held-out set; the month before them is the selection set; all earlier months train the model. Feature and hyperparameter choices use the selection set. The held-out set is used once, for the reported result.

### Estimate page

An interactive map of Tehran with hexagons of median asking price per square meter, computed from listing coordinates. Hexagons with too few listings are hidden, and no individual listing is exposed. Clicking the map selects an area. The form, map, and estimate sit side by side, so the result stays visible while inputs change. On phones the estimate comes first. The estimate is rounded to one decimal because more would imply false precision. A year outside 1370 to 1403 shows inline help, and very large areas show a low-data caution. Alongside it: property form with searchable neighborhood; estimate labeled `Market as of December 2024`; per-feature contribution breakdown (`w·x` plus bias); "Try a real listing" showing prediction beside the real asking price, without selecting flattering examples; limitations: asking price, not sale price or appraisal, stale market.

## 5. Site structure

The site has an `Estimate` page, a `Model Lab`, and a `Data` page. Code lives inside the Model Lab, not on its own page.

The Estimate page ends with a short project summary for reviewers: the model, the data, the honest result, and links to the Lab and repository.

### Model Lab

A guided sequence. Every experiment is labeled `Sandbox: does not affect the live model`, runs in the browser on a small embedded sample of at most 500 rows, and has a reset. Sandbox runtime is measured with `performance.now()`. No timing value is ever hard-coded.

Each stage offers switchable plot views, a side panel of live values, and controls for what that stage teaches. Stages from Gradient descent onward use one shared pattern: sliders for `w` and `b`, a logarithmic learning-rate slider, an iterations input, Start, Pause, Step, and Reset buttons, an animated run, and a replay slider that moves all plots together. Below the plots, every stage shows the math, how this project implements it, and the scikit-learn equivalent with a note on any difference. Where no equivalent exists, the stage says so.

The side panel shows only quantities taught by that stage or an earlier one, such as w, b, cost, and gradients. MSE, RMSE, L1 loss, L2 loss, and all the classification metrics are out of scope and stay off the site.

A stage never uses or relies on a concept from a later stage. Training controls appear from the Gradient descent stage onward; earlier stages let the visitor set values by hand. Held-out comparisons appear only in the final project step, which is labeled as a project step rather than a course concept.

Stages follow the course's learning order, not the pipeline order, and are grouped into parts in the side navigation.

| Part | Stages |
|---|---|
| One feature | Data and notation; Cleaning; The model; Cost function; Gradient; Gradient descent |
| Many features | Vectorization; Multiple features; Learning rate; Feature scaling; Feature engineering |
| Generalizing | Overfitting; Regularization; Held-out result |

The Lab opens at step 1, with a progress bar and Previous and Next buttons. The explanation below the plots uses three tabs: The math (notation, equations, live worked example), The code, and scikit-learn. On phones, the step list becomes a horizontally scrolling row.

Every stage contains:

- Interactive controls and switchable plots, with a side panel of live values.
- **Try this** presets that set values, run when relevant, and say what to look for.
- **Notation**: symbol, meaning in this project, and name in code.
- **The math, step by step**: each equation with a plain explanation of why it has that form.
- **Worked example, live**: real numbers substituted from the current settings.
- **The code, explained line by line**.
- **The same thing with scikit-learn**, with any differences noted, or a clear statement that no equivalent exists.

The course's optional labs are the reference for order and teaching ideas. All code, text, and data on the site are original; lab text, solutions, and images are not copied into the public repository.

### Data

Source, license, date range, fields, units, cleaning funnel with counts, missing values, limitations. Never show ad titles, descriptions, exact coordinates, or user fields.

### Code in the Model Lab

Snippets are extracted at build time from real source files, with GitHub permalinks. The Lab also shows the live model's measured training run and a NumPy versus scikit-learn cost comparison.

## 6. Visual design

Modern and clean, with rounded cards in a flexible grid, a pill-shaped navigation bar, and large numbers. Geist for all text and Geist Mono for data. One token system with a green accent. Mobile-first, light and asphalt themes, WCAG AA, full keyboard use, and meaning never carried by color alone. Fonts are self-hosted.

## 7. Testing

- **Training:** analytic gradients match numeric gradients; cost falls at a small learning rate; results agree with scikit-learn within a stated tolerance; repeat runs are deterministic.
- **Leakage:** neighborhood medians and scaling statistics use training rows only; selection dates follow training dates, and held-out dates follow selection dates.
- **Parity:** TypeScript and Python predictions match on fixture inputs within `1e-6` relative tolerance.
- **Isolation:** running every sandbox experiment leaves the deployed model object unchanged.
- **Scope:** a repository check fails if out-of-scope metric names appear in site source, training code, exported data, or the docs.
- **Site:** Playwright covers the main journeys, including empty and error states; axe checks every route in both themes at 1280 and 390 pixels wide, and the page must not scroll sideways at 390.

## 8. Repository and delivery

```text
<repo>/
  training/   prep, features, model, train
  tests/      Python tests
  model/      model.json
  data/       raw data folder (git-ignored); small processed files ship in web/public/data
  web/        Vite, React, TypeScript
  docs/       PROJECT_SPEC, LEARNING_NOTES, DATA_CARD, CHANGELOG, LEARNING_PROGRESS_TRACKER
  README.md
```

- Raw data is never committed. Code is MIT. Processed data is ODbL with attribution.
- CI runs the tests on push and pull request. A separate workflow deploys through GitHub Pages Actions when `main` changes.
- Training data is not available in CI, so tests that need it skip cleanly.
- `LEARNING_PROGRESS_TRACKER.md` is updated only where a concept is really implemented. The date log uses real dates.
- `LEARNING_NOTES.md` includes technical explanations and leaves "In my own words" for the author.

## 9. Differences between the design and the build

- Estimates below 0.5 billion toman show "too small for this model" instead of a number, because a few predictions are zero or negative.
- The contribution breakdown groups area, location, and their squares into one "Size and neighborhood" row, because the individual weights describe ad patterns, not causes.
- The Lab's plot axes come from data percentiles, because real prices span a very wide range.
- The Data page shows the cleaning funnel, fields with measured missing shares, and month-by-month counts. It does not list sample records.

## 10. Known risks

| Risk | Handling |
|---|---|
| House data ends in 2024 | Permanent as-of label |
| Listing prices are asking prices and can be wrong | Labeling, cleaning, documented bounds |
| A simple neighborhood rule can beat the model on a typical listing | Compared openly on the site and in the data card |
| Price unit is not stated in the data | Inferred from magnitude, labeled as an assumption |
