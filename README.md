# Tehran House Price Estimator

A small website that estimates the asking price of an apartment in Tehran from its area, neighborhood, rooms, age, parking, elevator and storage. It is built to show how a linear regression model works, from the raw ads to the trained weights, and to be honest about how far off it can be.

Live site: https://zahrabayatt.github.io/tehran-house-price/

The site has three pages:

- **Estimate:** fill in an apartment, see the estimate, how each feature adds to it, a map of median price per m2, and real listings with the model's miss next to the asking price.
- **Model Lab:** fourteen guided steps, from the data and the cost function to gradient descent, scaling, overfitting and the held-out result. Every step has the math, the real project code explained line by line, and the scikit-learn equivalent. Experiments run in the browser on a small sample and never change the live model.
- **Data:** where the numbers come from, the cleaning funnel with counts, the fields used and how often each is missing, and the limitations.

## Result, in plain words

The prices are **asking prices from ads, not sale prices**, from May to December 2024. The model was trained on May to September, its settings were chosen on October, and it was checked once on November and December.

- On a typical listing it is off by about **1.10 billion toman, or 15.6%** of the asking price. One listing in ten is off by more than 58.5%.
- A much simpler rule, area times the median price per m2 of the neighborhood, with no training at all, did slightly better on a typical listing (0.96 billion, or 14.2%). The trained model has the lower overall cost (18.28 against 28.13), because its cost counts big misses on expensive flats heavily. The full comparison table is in [`docs/DATA_CARD.md`](docs/DATA_CARD.md); the site states the finding in words.
- It tends to overestimate cheap flats and underestimate expensive ones, and for a few small, old flats it predicts a price at or below zero. The site shows "too small for this model" instead of a number in that case.

The full reading, with every candidate tried, is in [`docs/DATA_CARD.md`](docs/DATA_CARD.md).

## Run it

Needs Python 3.10 or newer, Node 22 or newer, and [pnpm](https://pnpm.io/).

### The site

```bash
cd web
pnpm install
pnpm dev          # development server
pnpm test         # unit tests
pnpm build        # type check and production build into web/dist
pnpm e2e          # browser tests and accessibility checks (run `pnpm exec playwright install chromium` once)
```

The trained model is already in the repository (`model/model.json`), so the site runs without any data download.

### Training

```bash
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt     # Windows; use .venv/bin/python elsewhere
.venv/Scripts/python -m training.download                   # fetches the raw data into data/raw (git-ignored)
.venv/Scripts/python -m training.prep                       # prints the cleaning funnel
.venv/Scripts/python -m training.train                      # trains, writes model/model.json and web/public/data/*.json
.venv/Scripts/python -m pytest                              # tests that need the raw data skip when it is absent
```

Training rewrites the model and data files and the generated part of the data card. The held-out months are meant to be looked at once; changing the model after seeing them means the held-out claim no longer holds.

## Data

[`divarofficial/real_estate_ads`](https://huggingface.co/datasets/divarofficial/real_estate_ads) on Hugging Face, a million real estate ads released by Divar, license **ODbL**. This project keeps Tehran apartments for sale at a fixed price, created May to December 2024 (81,603 ads after cleaning). The processed data in this repository carries the same license and attribution. The city outline on the map comes from OpenStreetMap, also ODbL. Ad titles, descriptions and user fields are never loaded, and coordinates are used only to build the map's hexagon medians. The raw data is not in the repository.

Details: [`docs/DATA_CARD.md`](docs/DATA_CARD.md) and [`docs/DATA_PROFILE.md`](docs/DATA_PROFILE.md).

## Limitations

- Asking prices are not sale prices. They can be negotiable, out of date or repeated.
- Eight months of data cannot show seasons or a long-run trend; the market shown is as of December 2024.
- The price unit is not stated in the data. Toman is inferred from the size of the numbers.
- Building age stops at 34 years, because the oldest group in the ads is "before 1370".
- A neighborhood with few ads uses the Tehran median, so its estimate is less specific.
- The model is linear. Its weights describe patterns in ads, not what an elevator or a parking space is worth.

## Course scope

This project follows **Course 1 of the Machine Learning Specialization** (Supervised Machine Learning: Regression and Classification), the linear regression part: prediction function, parameters, cost, gradient descent, learning rate, multiple features, vectorization, feature scaling, feature engineering, polynomial terms, overfitting and regularization. The logistic regression half is a separate project, [Tehran Air Risk](https://zahrabayatt.github.io/tehran-air-risk/) ([code](https://github.com/zahrabayatt/tehran-air-risk)).

Out of scope, because they are not part of what this project covers: Accuracy, Precision, Recall, F1-score, Confusion matrix, ROC-AUC, decision threshold analysis, and named error metrics such as MSE, RMSE and MAE. A plain-language typical miss (median gap in billions and as a share of price) is reported only to explain the result. A test (`tests/test_scope.py`) fails if these names appear in the site, the training code, the exported data or the docs.

[`docs/LEARNING_PROGRESS_TRACKER.md`](docs/LEARNING_PROGRESS_TRACKER.md) records which concepts are implemented and where.

## Repository

```text
training/   data preparation, features, model, training
tests/      Python tests
model/      model.json, the trained model
web/        the site (Vite, React, TypeScript)
docs/       project spec, learning notes, data card, changelog, progress tracker
```

## License

Code: MIT, see [`LICENSE`](LICENSE). Processed data: ODbL with attribution to the source above.
