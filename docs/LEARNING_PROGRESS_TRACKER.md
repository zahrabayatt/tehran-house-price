# Learning Progress and Scope Tracker

This file records which course concepts have been studied and implemented in this project. It is updated only where a concept is really implemented: a visitor can see it, the code exists, and a test checks it.

## Status definitions

- [ ] Not studied / not implemented.
- [~] Currently studying or planning the implementation.
- [x] Studied and implemented.

Do not mark a concept complete just because a placeholder or static explanation exists. The implementation should demonstrate the concept correctly.

Step names below are the steps of the Model Lab on the site. Code paths are relative to the repository root.

## Linear Regression: House Price Estimator

| Concept | Status | Implementation notes |
|---|---|---|
| Hypothesis / prediction function | [x] | Lab step 3, The model: set `w` and `b` by hand and see the line. Code: `predict` in `training/model.py`, `web/src/model/predict.ts` (runs the live estimate). Checked by `tests/test_model.py` and by Python-to-TypeScript parity fixtures. |
| Parameters: weights and bias | [x] | Lab steps 3 and 4. The deployed `w` and `b` are in `model/model.json`, and the Estimate page breaks a result into one term per feature plus bias. |
| Cost function | [x] | Lab step 4, Cost function: cost as a curve, contour, and surface over `w` and `b`. Code: `compute_cost` in `training/model.py`, `web/src/lab/engine.ts`. Checked against a hand-computed value in `tests/test_model.py`. |
| Gradient descent | [x] | Lab steps 5 and 6, Gradient and Gradient descent: run, pause, step, reset, replay. Code: `compute_gradient`, `gradient_descent` in `training/model.py`. Checked: analytic gradient equals numeric gradient; one step updates all parameters together; divergence stops early. |
| Learning rate | [x] | Lab step 9, Learning rate: a logarithmic slider, with cost curves for several rates showing slow, good, and diverging runs. Checked in `tests/test_model.py`: cost falls at a small rate, and a too-large rate is caught. |
| Multiple features | [x] | Lab step 8, Multiple features. The deployed model uses nine columns (see `docs/DATA_CARD.md`). |
| Vectorization | [x] | Lab step 7, Vectorization: a dot product replaces a loop, with the array shapes shown and the loop and NumPy run times measured when the model was trained. Code: `*_loop` functions in `training/model.py`. Checked: loop and vectorized results match. |
| Feature scaling | [x] | Lab step 10, Feature scaling: z-score scaling step by step, cost contours, and training with and without it. Code: `zscore_fit`, `zscore_apply` in `training/features.py`. Statistics come from training rows only; a zero spread does not divide by zero. |
| Feature engineering | [x] | Lab step 11, Feature engineering. The deployed model uses area times the neighborhood median price per m2, built in `training/features.py`; medians come from training rows only. |
| Polynomial regression | [x] | Lab steps 11 and 12 (degree control). The deployed model includes `area^2` and `location^2`, chosen on the selection month. |
| Overfitting / underfitting | [x] | Lab step 12, Overfitting: under, right, and over fits side by side. |
| Regularization | [x] | Lab step 13, Regularization: the penalty `lambda` shrinks weights, never the bias. Code: `compute_cost_reg`, `compute_gradient_reg`. The deployed model uses `lambda = 100`, chosen on the selection month. Checked against scikit-learn Ridge to ten decimal places. |

## Logistic Regression: Air Quality Risk Predictor

Logistic regression lives in the separate `tehran-air-risk` project and is tracked in that repository. Nothing in this repository implements it, so no concept is marked here.

## Not part of the current scope

Out of scope until studied and added on purpose: Accuracy, Precision, Recall, F1-score, Confusion matrix, Decision threshold analysis, ROC-AUC, and named error metrics such as MSE, RMSE and MAE. A plain-language typical miss (median gap in billions and as a share of price) is reported only to explain the result.

Revisit this list only when these topics are covered in the course.

## In my own words

The author writes these. They are left empty on purpose.

| Concept | In my own words |
|---|---|
| Hypothesis / prediction function | |
| Parameters: weights and bias | |
| Cost function | |
| Gradient descent | |
| Learning rate | |
| Multiple features | |
| Vectorization | |
| Feature scaling | |
| Feature engineering | |
| Polynomial regression | |
| Overfitting / underfitting | |
| Regularization | |

## Update log

| Date | Course concept learned | Project updated | What changed |
|---|---|---|---|
| 2026-11-03 | Linear regression: hypothesis, parameters, cost, gradient descent, learning rate, multiple features, vectorization, feature scaling, feature engineering, polynomial regression, overfitting, regularization | tehran-house-price | Version 1.0.0: all twelve concepts above are shown in the Model Lab, used in training, and covered by tests. |

## Notes for every update

For each new concept, record:

1. What the concept means in my own words.
2. Which project demonstrates it.
3. What the visitor can see or interact with.
4. Where the relevant code is located.
5. How I checked that the implementation is correct.
