# Tehran House Price Estimator

Estimate the asking price of a Tehran apartment from its area, neighborhood, rooms, age, parking, elevator and storage, and see how the linear regression behind it learns, step by step.

**Live site:** https://zahrabayatt.github.io/tehran-house-price/

- **Estimate:** describe a flat or pick its neighborhood on the map, and get its price in December 2024 with the range similar ads asked then.
- **Data:** where the ads come from, how they were cleaned, and what the data cannot tell you.
- **Model Lab:** fifteen interactive steps, from the first data point to the final check on months the model never saw.

## The result

- Trained on ads from May to September 2024 and checked once on November and December 2024, which it never saw.
- The model learns the log of the price, so a 10% miss counts the same on a cheap and a dear flat.
- On a typical flat the estimate is off by about **0.82 billion toman, or 12.1%** of the asking price. One flat in ten is off by more than 40.1%.
- Prices are **asking prices from ads**, not sale prices, and they are from 2024. Tehran asking prices are about 3 times higher today.

More detail, including every model that was tried: [`docs/DATA_CARD.md`](docs/DATA_CARD.md).

## Run it

The trained model is in the repository, so the site runs without downloading any data. Needs Node 22 or newer and [pnpm](https://pnpm.io/).

```bash
cd web
pnpm install
pnpm dev
```

To train the model again you need Python 3.10 or newer:

```bash
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt   # use .venv/bin/python outside Windows
.venv/Scripts/python -m training.download
.venv/Scripts/python -m training.train
```

## Data

[`divarofficial/real_estate_ads`](https://huggingface.co/datasets/divarofficial/real_estate_ads) on Hugging Face, released by Divar under **ODbL**. This project keeps Tehran apartments for sale at a fixed price, May to December 2024: 81,603 ads after cleaning. Neighborhood boundaries come from OpenStreetMap, also ODbL. Ad text and user fields are never loaded.

## Limitations

- Asking prices are not sale prices.
- The prices are from 2024; they show that market, not today's.
- The model is linear and only sees the fields above, not a flat's view, floor or renovation.

## License

Code: MIT, see [`LICENSE`](LICENSE). Processed data: ODbL, with attribution to the source above.
