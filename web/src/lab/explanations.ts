/**
 * The line-by-line explanations of the code the Lab shows.
 *
 * Code is read from training/*.py at build time (plugins/code-snippets.ts). Each explanation is
 * keyed by the exact text of its line, indentation included. A line with no entry is shown with
 * a blank explanation. explanations.test.ts fails if a key stops matching a line, so editing the
 * Python cannot leave an explanation attached to the wrong code.
 */
export const EXPLANATIONS: Record<string, Record<string, string>> = {
  load_xy: {
    'def load_xy(rows):': 'Takes the sample listings as a list of dictionaries.',
    '    x_train = np.array([r["area"] for r in rows]) / 100': 'Area in hundreds of m², so values stay near 1.',
    '    y_train = np.array([r["price"] for r in rows])': 'Asking price in billions.',
    '    m = x_train.shape[0]': 'shape[0] is the number of rows.',
  },

  price_bounds: {
    'def keep_price_range(prices, low, high):': 'Returns only the prices inside the bounds.',
    '    prices = np.asarray(prices, dtype=float)': 'Accepts a list or an array.',
    '    keep = (prices >= low) & (prices <= high)': 'True for every price inside both bounds. The & means "and", element by element.',
    '    return prices[keep]': 'Indexing with a row of True and False keeps the True ones.',
  },

  predict_one: {
    'def predict_one(x, w, b):': 'One prediction for every example.',
    '    m = x.shape[0]': 'Number of examples.',
    '    f_wb = np.zeros(m)': 'Space for m predictions.',
    '    for i in range(m):': 'Visit each example in turn.',
    '        f_wb[i] = w * x[i] + b': 'Exactly the equation above.',
  },

  cost_one: {
    'def cost_one(x, y, w, b):': 'The cost of one choice of w and b.',
    '    m = x.shape[0]': 'Number of examples.',
    '    cost_sum = 0.0': 'Running total of squared errors.',
    '    for i in range(m):': 'Go through every example.',
    '        f_wb = w * x[i] + b': 'The prediction for example i.',
    '        cost_sum += (f_wb - y[i]) ** 2': 'Add its squared error.',
    '    return cost_sum / (2 * m)': 'The 1 / 2m in the equation.',
  },

  gradient_one: {
    'def gradient_one(x, y, w, b):': 'The two slopes at one choice of w and b.',
    '    m = x.shape[0]': 'Number of examples.',
    '    dj_dw = 0.0': 'Running total for the slope of w.',
    '    dj_db = 0.0': 'Running total for the slope of b.',
    '    for i in range(m):': 'Go through every example.',
    '        err = (w * x[i] + b) - y[i]': 'The error on example i.',
    '        dj_dw += err * x[i]': 'Term of ∂J/∂w.',
    '        dj_db += err': 'Term of ∂J/∂b.',
    '    return dj_dw / m, dj_db / m': 'Average over m.',
  },

  descent_one: {
    'def descent_one(x, y, w, b, alpha, num_iters):': 'Start from the given w and b and take num_iters steps.',
    '    J_history = []': 'Saved so cost can be plotted.',
    '    for _ in range(num_iters):': 'One update per iteration.',
    '        dj_dw, dj_db = gradient_one(x, y, w, b)': 'Both slopes, using the current w and b.',
    '        w = w - alpha * dj_dw': 'Step w downhill.',
    '        b = b - alpha * dj_db': 'Step b downhill, with the old slope.',
    '        J_history.append(cost_one(x, y, w, b))': 'Should fall every time.',
    '    return w, b, J_history': 'The final w and b, and the cost after each step.',
  },

  dot_loop: {
    'def dot_loop(a, b):': 'The slow version, written by hand.',
    '    total = 0.0': 'Running sum.',
    '    for i in range(a.shape[0]):': 'One Python step per element.',
    '        total = total + a[i] * b[i]': 'Multiply a pair, add it to the sum.',
    '    return total': 'A single number.',
  },

  time_dot: {
    'def time_dot(size=1_000_000, repeats=5):': 'Times both versions on two long vectors.',
    '    rng = np.random.default_rng(0)': 'A fixed seed, so every run uses the same numbers.',
    '    a, b = rng.random(size), rng.random(size)': 'Two vectors of random numbers.',
    '    tic = time.perf_counter()': 'Start the clock.',
    '    dot_loop(a, b)': 'The loop version, run once because it is slow.',
    '    loop_ms = (time.perf_counter() - tic) * 1000': 'Elapsed time in milliseconds.',
    '    for _ in range(repeats):': 'NumPy is fast enough to time several times.',
    '        np.dot(a, b)': 'NumPy runs this in compiled code.',
    '        best = min(best, time.perf_counter() - tic)': 'Keep the fastest run, which has the least interference.',
    '    return {"elements": size, "loop_ms": loop_ms, "numpy_ms": best * 1000}': 'Stored in model.json and shown on this page as a measurement.',
  },

  compute_gradient_loop: {
    'def compute_gradient_loop(X, y, w, b):': 'Slopes for every weight and for b.',
    '    m, n = X.shape': 'Examples and features.',
    '    dj_dw = np.zeros(n)': 'One slope per weight.',
    '    dj_db = 0.0': '',
    '    for i in range(m):': 'Outer loop over examples.',
    '        f_i = b': 'Start the prediction at b.',
    '        for j in range(n):': 'Inner loop over features.',
    '            f_i += X[i, j] * w[j]': 'Add each feature times its weight.',
    '        err = f_i - y[i]': 'Prediction minus target.',
    '            dj_dw[j] += err * X[i, j]': 'Error times feature j.',
    '        dj_db += err': 'The same error, without a feature.',
    '    return dj_dw / m, dj_db / m': 'Average over m.',
  },

  gradient_vec: {
    'def gradient_vec(X, y, w, b):': 'The same slopes without any loop.',
    '    m = X.shape[0]': 'Number of examples.',
    '    err = X @ w + b - y': 'All errors in one line.',
    '    dj_dw = X.T @ err / m': 'All slopes in one line.',
    '    dj_db = err.mean()': 'Average error.',
  },

  lr_race: {
    'def race_learning_rates(X, y, alphas, num_iters=100):': 'Runs gradient descent once for each learning rate.',
    '    histories = {}': 'One cost curve per rate.',
    '    for alpha in alphas:': 'Try values spaced apart.',
    '        w0, b0 = np.zeros(X.shape[1]), 0.0': 'Same start each time.',
    '        w, b, J_history = gradient_descent(X, y, w0, b0, alpha, num_iters)': 'The same function as before, with a different alpha.',
    '        histories[alpha] = J_history': 'Keep the curve to compare.',
    '    return histories': '',
  },

  zscore: {
    'def zscore_fit(X) -> tuple[np.ndarray, np.ndarray]:': 'Measures the mean and spread of each column.',
    '    """Per-column mean and standard deviation. A constant column gets sigma = 1."""': '',
    '    X = np.asarray(X, dtype=float)': '',
    '    if X.ndim == 1:': 'A single feature arrives as a flat list.',
    '        X = X.reshape(-1, 1)': 'Make it one column.',
    '    mu = X.mean(axis=0)': 'axis=0 means per column, shape (n,).',
    '    sigma = X.std(axis=0)': 'Spread of each column.',
    '    sigma = np.where(sigma > 0, sigma, 1.0)': 'A column that never changes would divide by zero, so use 1 instead.',
    '    return mu, sigma': 'Keep mu and sigma for later predictions.',
    'def zscore_apply(X, mu, sigma) -> np.ndarray:': 'Scales any rows with numbers measured earlier.',
    '    sigma = np.asarray(sigma, dtype=float)': '',
    '    return (X - mu) / sigma': 'Broadcasting applies it to every row. New apartments use the training mu and sigma.',
  },

  location_lookup: {
    'def location_lookup(train: pd.DataFrame, min_rows: int = 30': 'Builds the neighborhood table from the training rows.',
    '    fallback = float(train["price_per_m2"].median())': 'The Tehran median as a fallback.',
    '    known = train[train["neighborhood"].notna()]': 'Rows that name a neighborhood.',
    '    grouped = known.groupby("neighborhood")["price_per_m2"]': 'One group of prices per neighborhood.',
    '    medians = grouped.median()': 'The typical price per m² in each.',
    '    counts = grouped.count()  # rows with a usable price, not all rows': 'How much data each median rests on.',
    '    lookup = {str(k): float(medians[k]) for k in medians.index': 'Keep a neighborhood only if it has enough rows.',
    '              if counts[k] >= min_rows}': 'Ignore neighborhoods with little data.',
    '    return lookup, fallback': 'The table, and the fallback for everywhere else.',
  },

  location_feature: {
    'def location_feature(df: pd.DataFrame, lookup: dict[str, float],': 'Turns each listing into one location number.',
    '    ppm2 = np.array([lookup.get(n, fallback) if isinstance(n, str) else fallback': 'Look up each row, using the fallback when the neighborhood is blank or unknown.',
    '    return df["area"].to_numpy(dtype=float) * ppm2 / 1000.0': 'Area times price per m², in billions.',
  },

  poly_features: {
    'def poly_features(x, degree):': 'New columns made from one feature.',
    '    return np.column_stack([x ** p for p in range(1, degree + 1)])': 'Powers x, x², and so on up to the degree, side by side as columns.',
  },

  fit_degrees: {
    'def fit_degrees(x_train, y_train, degrees, num_iters=500):': 'Fits one curve for each degree on the same points.',
    '    fits = {}': '',
    '    for degree in degrees:': 'Try increasing complexity.',
    '        X_poly = poly_features(x_train, degree)': 'Add x², x³, and so on.',
    '        mu, sigma = zscore_fit(X_poly)': 'Measure each power, because the powers differ widely.',
    '        X_poly = zscore_apply(X_poly, mu, sigma)': 'Scale every power to a similar size.',
    '        alpha = 1 / (degree + 1)': 'Every column now has spread 1, so this step size is always safe.',
    '        w, b, _ = gradient_descent(X_poly, y_train, np.zeros(degree), 0.0, alpha, num_iters)': 'The same gradient descent as before.',
    '        fits[degree] = (w, b, mu, sigma)': 'Keep what is needed to draw the curve.',
    '    return fits': '',
  },

  compute_cost_reg: {
    'def compute_cost_reg(X, y, w, b, lambda_):': 'Cost with a penalty on large weights.',
    '    m, n = X.shape': '',
    '    cost = compute_cost_loop(X, y, w, b)': 'The usual fit term.',
    '    penalty = 0.0': '',
    '    for j in range(n):': 'Every weight.',
    '        penalty += w[j] ** 2': 'Add its square. b is left out.',
    '    return cost + lambda_ / (2 * m) * penalty': 'Added penalty, scaled by lambda over 2m.',
  },

  compute_gradient_reg: {
    'def compute_gradient_reg(X, y, w, b, lambda_):': 'Slopes of the penalized cost.',
    '    m, n = X.shape': '',
    '    dj_dw, dj_db = compute_gradient_loop(X, y, w, b)': 'The slopes without a penalty.',
    '    for j in range(n):': 'Every weight.',
    '        dj_dw[j] += lambda_ / m * w[j]': 'The extra term from the penalty.',
    '    return dj_dw, dj_db': 'b is unchanged.',
  },

  gradient_descent: {
    'def gradient_descent(X, y, w, b, alpha, num_iters, lambda_=0.0):': 'The production version. lambda_=0.0 means no penalty unless one is given.',
    '    w = np.array(w, dtype=float)': 'Copies, so the inputs are never changed.',
    '    b = float(b)': '',
    '    J_history = []': 'Cost after each update.',
    '    with np.errstate(all="ignore"):': 'An overflow is handled below, not printed as a warning.',
    '        for _ in range(num_iters):': 'One update per iteration.',
    '            dj_dw, dj_db = compute_gradient(X, y, w, b, lambda_)': 'Slopes of the penalized cost, from the current w and b.',
    '            w_new = w - alpha * dj_dw': 'The step for w, not applied yet.',
    '            b_new = b - alpha * dj_db': 'The step for b, from the same old slopes.',
    '            cost = compute_cost(X, y, w_new, b_new, lambda_)': 'Cost after the step.',
    '            if not np.isfinite(cost):': 'A cost that is not a finite number means alpha was too large.',
    '                break': 'Stop at once and keep the last good w and b.',
    '            w, b = w_new, b_new': 'Both change together, as in the equations.',
    '            J_history.append(cost)': 'Should fall every time.',
    '    return w, b, J_history': 'A history shorter than num_iters means the run diverged.',
  },

  split_by_month: {
    'def split_by_month(df: pd.DataFrame': 'Splits listings by when they were posted.',
    '    months = sorted(df["month"].dropna().unique())': 'Every month in the data, in order.',
    '    if len(months) < 4:': 'Three groups need at least four months.',
    '    held_months, sel_month = months[-2:], months[-3]': 'The last two months are held out. The one before them is for choosing.',
    '    m = df["month"]': '',
    '    held = df[m.isin(held_months)]': 'Time order, so the check comes after training.',
    '    sel = df[m == sel_month]': 'The month used to compare candidate models.',
    '    train = df[m < sel_month]': 'Everything earlier trains the model.',
    '    return train, sel, held': '',
  },

  evaluate_held_out: {
    'def evaluate_held_out(fit: dict, held: pd.DataFrame) -> tuple[float, dict, np.ndarray]:': 'The check on listings the model never saw.',
    '    pred = predict_fit(fit, held)': 'Predict with the already fixed model. Scaling uses the training mu and sigma.',
    '    return plain_cost(fit, held), plain_gap(held["price"].to_numpy(dtype=float), pred), pred': 'The cost with no penalty, the plain-language gap, and the predictions. Reported once.',
  },
};
