# Learning notes

Technical explanations of the Course 1 concepts this project uses, tied to the code. Each section ends with an empty "In my own words" heading. The author writes those; they are left blank on purpose.

Notation: `m` is the number of training rows, `n` the number of features, `x` one row of features, `y` the asking price in billions of toman, `w` the weights, `b` the bias. Code paths are relative to the repository root.

## Hypothesis: the prediction function

A linear model predicts the price as a weighted sum of the features plus a constant:

```text
f(x) = w1*x1 + w2*x2 + ... + wn*xn + b = w . x + b
```

`predict` in `training/model.py` computes this for every row at once as `X @ w + b`. The site does the same sum in TypeScript (`web/src/model/predict.ts`) using the weights in `model/model.json`. A test compares Python and TypeScript on fixed inputs to a relative tolerance of `1e-6`, so the live estimate is the trained model and not a rewrite of it.

### In my own words

## Parameters: weights and bias

`w` and `b` are the only numbers training changes. Each weight says how much the prediction moves when its feature rises by one unit with the others held fixed; `b` is the prediction when every feature is zero. The features are scaled before training (see feature scaling), so `b` here is the prediction for an average apartment and each weight is per standard deviation of its feature.

Reading a weight as the worth of a feature is a trap. In this data the elevator weight is negative, because elevators come with other features that overlap with it (area, neighborhood). The Estimate page therefore groups area and location into one row and says that weights describe patterns in ads, not causes.

### In my own words

## Cost function

Cost measures how wrong the parameters are over the whole training set, in one number:

```text
J(w, b) = 1/(2m) * sum over rows of (f(x_i) - y_i)^2
```

The squared gap makes a large miss count much more than a small one: a miss of 20 billion weighs 400 times a miss of 1 billion. The factor 2 cancels when the gradient is taken. `compute_cost` in `training/model.py` is this formula. The Lab shows it as a curve over one weight, then as contours and a surface over `w` and `b`.

The squared weighting has a consequence for this project: the fit serves expensive listings at the expense of cheap ones, which is visible in the data card (cheap flats are overestimated, expensive ones underestimated).

### In my own words

## Gradient descent

Gradient descent lowers the cost by repeating one step: move every parameter a little against the slope of the cost, using all rows each time.

```text
dJ/dw_j = 1/m * sum over rows of (f(x_i) - y_i) * x_ij
dJ/db   = 1/m * sum over rows of (f(x_i) - y_i)
w_j := w_j - alpha * dJ/dw_j       b := b - alpha * dJ/db
```

All parameters are updated together from the same old values; `gradient_descent` computes both new values before assigning either. If the cost stops being finite the run stops and returns the last finite parameters, so a diverging run does not poison later code.

How it was checked: `tests/test_model.py` compares the analytic gradient with a numeric one (finite differences), checks that cost falls at a small learning rate, and checks that one step updates all parameters from the same starting point.

### In my own words

## Learning rate

`alpha` sets the step size. Too small and the cost falls very slowly; too large and each step overshoots the minimum, the cost rises, and the run diverges. The Lab's Learning rate step plots the cost curves for several values together. Training here uses `alpha = 0.3` for 5,000 updates on scaled features; every candidate model settled (cost moved by less than one part in ten million over the last 100 updates).

The right `alpha` depends on the scale of the features, which is why the learning rate and scaling steps belong together: unscaled features need a far smaller `alpha`.

### In my own words

## Multiple features

With several features, `w` becomes a vector and the same formulas hold: one gradient per weight, all computed from the same errors. The deployed model uses nine columns: area, the location feature, rooms, age, parking, elevator, storage, and the squares of area and location. Which columns to keep was decided by selection-month cost, across 20 feature sets, not by looking at the held-out months.

### In my own words

## Vectorization

A dot product written as a Python loop touches one number at a time. `X @ w` hands the whole operation to NumPy, which runs it in compiled code over contiguous memory. The results are identical (a test checks the loop versions in `training/model.py` against the vectorized ones); only the time differs. The Lab's Vectorization step shows the shapes involved and the loop and NumPy run times measured when the model was trained (`vectorization` in `model/model.json`), not typed-in numbers.

### In my own words

## Feature scaling

Features here live on very different scales (area in tens or hundreds, a 0 or 1 flag, age in years). On raw values the cost surface is a long narrow valley and gradient descent zigzags down it. Z-score scaling gives every column mean 0 and standard deviation 1:

```text
x_scaled = (x - mu) / sigma
```

`zscore_fit` and `zscore_apply` in `training/features.py` do this. `mu` and `sigma` come from training rows only and are stored in `model.json`, so the site scales a visitor's input with the same numbers. A column with no spread gets `sigma = 1` instead of dividing by zero. The Lab compares contours and training with and without scaling.

### In my own words

## Feature engineering

A new column built from the data can give a linear model something it cannot make from the raw columns. Here the location feature is area times the median asking price per m2 of the apartment's neighborhood. The medians come from training rows only; a neighborhood with fewer than 30 training rows with a usable price falls back to the Tehran training median. That rule is built in `training/features.py` and the lookup travels inside `model.json`.

One limit is stated openly in the data card: each training row helped set its own neighborhood's median, so training cost is slightly flattering. Selection and held-out rows did not.

### In my own words

## Polynomial regression

Adding powers of a feature (`area^2`, `location^2`) lets a model that is linear in its weights fit a curve. The Lab's feature engineering and overfitting steps let a visitor raise the degree on a small sample and watch the fit. In the deployed model `build_matrix` creates a column such as `location^2` from its name; the squares were part of the 20 feature sets compared on the selection month, and the winner kept both.

### In my own words

## Overfitting and underfitting

A model too simple for the pattern misses it even on the data it trained on (underfit, high bias). A model flexible enough to follow every training point, noise included, does well on training data and worse on new data (overfit, high variance). The Lab shows an under, a right, and an over fit on the same sample. The remedy for overfitting is more data, fewer features, or regularization.

In this project the guard against fooling ourselves is the time split: training months, one selection month for choices, and two held-out months looked at once for the reported result. Costs still drift upward with time (16.07 train, 17.04 selection, 18.28 held-out), which the data card reports.

### In my own words

## Regularization

Regularization adds a penalty on the size of the weights to the cost, so large weights have to earn their place:

```text
J(w, b) = 1/(2m) * sum of squared gaps + lambda/(2m) * sum of w_j^2
```

The bias is not penalized. `lambda` is chosen on the selection month from 0, 10, 100, 1,000, and 10,000; the winner is `lambda = 100`, a near tie with `lambda = 0` (a 0.12% difference in selection cost on one month of data). Two checks: the penalty shrinks weights toward zero in a test, and scikit-learn's Ridge regression with the same `lambda` matches this project's descent to ten decimal places, which shows descent reached the true minimum.

### In my own words

## Held-out result and the simple baseline

The final project step compares the model with three simple rules on months it never used. The typical (median) listing is off by about 1.10 billion toman, or 15.6% of its price. Multiplying the area by the neighborhood median price per m2, with no training, did slightly better on a typical listing (0.96 billion, 14.2%), while the trained model has the lower overall cost (18.28 against 28.13). Both statements are true. The comparison numbers are in `docs/DATA_CARD.md`; the site states the finding in words.

This comparison was made after the held-out look, so it cannot be used to pick a different model from the same months without losing the claim that the held-out data was untouched.

### In my own words
