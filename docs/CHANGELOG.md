# Changelog

All notable changes to this project. Dates are real dates.

## 1.0.0 - 2026-11-03

First complete version.

### Added

- Cleaning pipeline for Tehran apartment-sale ads (May to December 2024), with every step counted, documented bounds, and a data card.
- Linear regression trained with this project's own gradient descent: prediction, cost, gradient, scaling, a neighborhood-median location feature, squared terms, and an optional weight penalty. Choices use a selection month; the final two months were held out and looked at once.
- Estimate page: form, searchable neighborhood, hexagon price map, estimate with a per-feature breakdown, and real listings beside the model's miss.
- Model Lab: fourteen guided steps with live plots, run controls, math, line-by-line project code, and scikit-learn equivalents. Experiments run in the browser and cannot change the live model.
- Data page: source, license, period, cleaning funnel, fields with measured missing shares, month-by-month counts, and limitations.
- Checks: Python tests, TypeScript tests, Python-to-TypeScript prediction parity, browser tests, an accessibility check (axe) on every route in both themes at desktop and phone widths, and a scope check for out-of-scope metric names.
- Continuous integration (tests on push) and a GitHub Pages deploy workflow.
- Documentation: README, project spec, learning notes, data card, progress tracker.

### Fixed

- Scrollable tables, equations and code blocks can now be reached with the keyboard.
