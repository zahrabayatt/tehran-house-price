# Changelog

All notable changes to this project. Dates are real dates.

## 2.0.0 - 2026-11-07

A redesign after a page-by-page review (`docs/improvements/house-price-improvements.md` in the planning folder).

### Changed

- Estimate page: three things only. The form; the estimate, labelled as a December 2024 price, with the range similar ads asked then and a note that Tehran asking prices are about 3 times higher today; and a street map (MapLibre, OpenFreeMap tiles) of Tehran's official neighborhoods coloured by price. The neighborhood can be picked on the map or by name, and one official name is used everywhere.
- Data page: four facts, the cleaning in five plain steps, how close the model is (with real test ads and the comparison with a simple rule), prices by month in 2024, what the model knows and cannot see.
- Model Lab: every step redesigned. All 48,332 training ads instead of a 500-ad sample, charts that update together, draggable lines and handles, a 3D cost bowl, a player bar for training, plain-decimal learning rates, skeleton loading. Code tabs still show the real training code; a scikit-learn tab appears only where a real equivalent exists.
- Header: the theme switch is an icon button outside the navigation, the site opens dark, and the navigation reads Estimate, Data, Model Lab.
- README: shorter; the course scope and repository sections were removed.

### Removed

- The hexagon map, the per-feature breakdown and the listings table on the Estimate page; the Lab's sample-based engine and fixtures.

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
