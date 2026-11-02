import { count, fixed, n3 } from '../format';
import { fitSubset, multiRun, subsetCost } from '../context';
import { lab } from '../snippets';
import type { Stage } from '../types';
import { VIEWS } from '../views';
import { DOT_WEIGHTS } from '../views/many';
import { tex, view } from './shared';

/** Steps 7 to 11: many features, vectorization, learning rate, scaling and feature engineering. */

const WEIGHT_NAMES = ['w₀ (area)', 'w₁ (bedrooms)', 'w₂ (age)', 'w₃ (parking)'];

const ms = (v: number) => `${v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)} ms`;

const multiStats: Stage['stats'] = (_ctx, c) => {
  const q = c.histM[c.histM.length - 1];
  return [{ k: 'Cost J', v: n3(q.j) }]
    .concat(q.w.map((v, j) => ({ k: WEIGHT_NAMES[j] ?? `w${j}`, v: v.toExponential(2) })))
    .concat([{ k: 'b', v: fixed(q.b, 3) }]);
};

export const MANY_FEATURES: Stage[] = [
  {
    part: 'Many features',
    week: 'Course 1, Week 2. Python, NumPy, and vectorization.',
    title: 'Vectorization',
    text: 'Before adding features, learn the tool that makes them practical. A dot product replaces a loop.',
    ctl: ['m', 'nf', 'row'],
    views: [view('Dot product', VIEWS.dotProduct), view('Shapes', VIEWS.shapes)],
    stats: (ctx, c) => {
      const v = ctx.model.vectorization;
      return [
        { k: 'Rows m', v: count(c.m) },
        { k: 'Features n', v: String(c.nf) },
        { k: 'Multiplications', v: count(c.m * c.nf) },
        { k: 'NumPy, vectorized', v: v ? ms(v.numpy_ms) : 'not measured' },
        { k: 'Python loop', v: v ? ms(v.loop_ms) : 'not measured' },
      ];
    },
    notation: [
      { s: tex`\mathbf{w},\ \mathbf{x}`, m: 'Vectors with n elements', c: 'w, x   shape (n,)' },
      { s: tex`\mathbf{X}`, m: 'Matrix with m rows and n columns', c: 'X   shape (m, n)' },
      { s: tex`\mathbf{w}\cdot\mathbf{x}`, m: 'Dot product', c: 'np.dot(w, x)' },
    ],
    math: [
      {
        tex: tex`\mathbf{w}\cdot\mathbf{x} = w_0x_0 + w_1x_1 + \cdots + w_{n-1}x_{n-1} = \sum_{j=0}^{n-1} w_j\,x_j`,
        why: 'Multiply matching elements, then add. The result is a single number.',
      },
      {
        tex: tex`\hat{\mathbf{y}} = \mathbf{X}\mathbf{w} + b`,
        why: 'Do that for every row at once. With shapes (m, n) and (n,), the result has shape (m,).',
      },
    ],
    worked: (ctx, c) => {
      const x = ctx.d.X[Math.min(c.row, ctx.d.n - 1)];
      const s = x.reduce((a, v, j) => a + v * DOT_WEIGHTS[j], 0);
      const v = ctx.model.vectorization;
      const timing = v
        ? `\n\nThe same dot product on ${count(v.elements)} numbers, measured when the model was trained:\nPython loop ${ms(v.loop_ms)}, NumPy ${ms(v.numpy_ms)}`
        : '';
      return `Row ${c.row}: x = [${x.map((q) => q.toFixed(1)).join(', ')}]\nw · x = ${x.map((q, j) => `${DOT_WEIGHTS[j]}×${q.toFixed(1)}`).join(' + ')}\n      = ${fixed(s, 2)}${timing}`;
    },
    code: [lab('dot_loop'), lab('time_dot')],
    sk: '# Happens inside every estimator:\nmodel.predict(X)',
    skNote: 'scikit-learn has no separate step for this because it is already vectorized through NumPy.',
    tries: [
      {
        label: 'A much bigger dataset',
        note: 'Multiplications grow with m × n, so loops quickly become slow.',
        set: { m: 5000, nf: 12 },
      },
      {
        label: 'A different listing',
        note: 'Each bar is one wⱼxⱼ. Their sum is the dot product.',
        set: { row: 7, view: 0 },
      },
    ],
  },
  {
    week: 'Course 1, Week 2. Multiple variable linear regression.',
    title: 'Multiple features',
    text: 'Area alone cannot explain a price. Use several features, each with its own weight. Train on the raw values and watch how each weight moves.',
    kind: 'multi',
    train: true,
    alpha: { min: -6, max: -3.4, init: -4.3 },
    defaults: { alphaExp: -4.3, iters: '500' },
    views: [
      view('Each feature vs price', VIEWS.featurePanels),
      view('Cost by iteration', VIEWS.multiCost),
      view('Weights', VIEWS.multiWeights),
    ],
    stats: multiStats,
    notation: [
      { s: tex`x_j^{(i)}`, m: 'Feature j of example i', c: 'X[i, j]' },
      { s: tex`\mathbf{x}^{(i)}`, m: 'All features of example i', c: 'X[i]' },
      { s: tex`n`, m: 'Number of features', c: 'X.shape[1]' },
      { s: tex`\mathbf{w}`, m: 'One weight per feature', c: 'w   shape (n,)' },
    ],
    math: [
      {
        tex: tex`f_{\mathbf{w},b}(\mathbf{x}) = w_0x_0 + w_1x_1 + \cdots + w_{n-1}x_{n-1} + b = \mathbf{w}\cdot\mathbf{x} + b`,
        why: 'Each weight says how much the price changes when that feature grows by one, with the others held fixed.',
      },
      {
        tex: tex`J(\mathbf{w},b) = \frac{1}{2m} \sum_{i} \left( f_{\mathbf{w},b}\!\left(\mathbf{x}^{(i)}\right) - y^{(i)} \right)^2`,
        why: 'The same cost. Only the model inside it has changed.',
      },
      {
        tex: tex`\begin{aligned} \frac{\partial J}{\partial w_j} &= \frac{1}{m} \sum_{i} \left( f_{\mathbf{w},b}\!\left(\mathbf{x}^{(i)}\right) - y^{(i)} \right) x_j^{(i)}\\[4pt] \frac{\partial J}{\partial b} &= \frac{1}{m} \sum_{i} \left( f_{\mathbf{w},b}\!\left(\mathbf{x}^{(i)}\right) - y^{(i)} \right) \end{aligned}`,
        why: 'One slope per weight. The error is shared, and multiplied by that weight’s own feature.',
      },
    ],
    worked: (ctx, c) => {
      const q = c.histM[c.histM.length - 1];
      const x = ctx.d.X[0];
      const p = x.reduce((a, v, j) => a + v * q.w[j], q.b);
      return `x⁽⁰⁾ = [${x.map((v) => v.toFixed(1)).join(', ')}]\nw    = [${q.w.map((v) => v.toExponential(2)).join(', ')}]\nf = w · x + b = ${fixed(p, 2)}     actual: ${ctx.d.y[0].toFixed(2)}`;
    },
    code: [lab('compute_gradient_loop'), lab('gradient_vec')],
    sk: 'from sklearn.linear_model import SGDRegressor\n\nmodel = SGDRegressor(max_iter=1000).fit(X_train, y_train)\nmodel.coef_       # one weight per feature\nmodel.intercept_  # b',
    skNote: 'The default SGDRegressor changes its step size during training, so its values differ a little.',
    tries: [
      {
        label: 'Small α, long run',
        note: 'Stable. The area weight settles first, while the weights for bedrooms, age and parking are still moving after 1500 iterations.',
        set: { alphaExp: -4.3, iters: '1500' },
        run: true,
      },
      {
        label: 'Just below the limit',
        note: 'A larger α reaches a lower cost in the same 500 iterations, but it sits close to the largest step that still works.',
        set: { alphaExp: -3.92, iters: '500' },
        run: true,
      },
      {
        label: 'Just past the limit',
        note: 'Above roughly 1.6e-4 the cost grows instead of falling and the run diverges.',
        set: { alphaExp: -3.6, iters: '100' },
        run: true,
      },
    ],
  },
  {
    week: 'Course 1, Week 2. Learning rate.',
    title: 'Learning rate',
    text: 'Too small is slow. Too large overshoots. Add your own values and race them.',
    kind: 'multi',
    train: true,
    lrs: true,
    defaults: { iters: '100' },
    views: [view('Cost curves', VIEWS.lrCurves), view('w₀ by iteration', VIEWS.lrW0)],
    stats: (ctx, c) =>
      c.lrs.map((a) => {
        const r = multiRun(ctx, false, a, c.iters);
        const q = r.h[Math.min(c.it, r.h.length - 1)];
        return { k: `α = ${a}`, v: r.diverged !== null && c.it >= r.diverged ? 'diverged' : n3(q.j) };
      }),
    notation: [{ s: tex`\alpha`, m: 'Learning rate, shared by all parameters', c: 'alpha' }],
    math: [
      {
        tex: tex`w_j := w_j - \alpha\,\frac{\partial J}{\partial w_j}`,
        why: 'α scales every step. A correct run has cost falling on every iteration.',
      },
      {
        tex: tex`\begin{aligned} \text{Too large:}\quad & \text{cost rises, slopes flip sign each step}\\ \text{Just below:}\quad & \text{the weight zig-zags, cost still falls}\\ \text{Small:}\quad & \text{the weight approaches smoothly, cost falls slowly} \end{aligned}`,
        why: 'Those are the three patterns to look for. A rising cost means reduce α first.',
      },
    ],
    worked: (ctx, c) => {
      const a = c.lrs[0] ?? 1e-5;
      const r = multiRun(ctx, false, a, c.iters);
      const k = Math.min(c.it, r.h.length - 1);
      const q = r.h[k];
      return `α = ${a} at iteration ${k}:\nJ = ${n3(q.j)}\nw₀ = ${q.w[0].toExponential(3)}`;
    },
    code: [lab('lr_race')],
    sk: 'SGDRegressor(\n    learning_rate="constant",\n    eta0=alpha,\n)',
    skNote: 'eta0 is scikit-learn’s name for α. Its default schedule changes α during training, so set "constant" to compare.',
    tries: [
      {
        label: 'Race four values',
        note: 'The largest diverges, and the one just below it zig-zags. See "w₀ by iteration".',
        set: { lrs: [0.00001, 0.00005, 0.00014, 0.0002], iters: '100' },
        run: true,
      },
    ],
  },
  {
    week: 'Course 1, Week 2. Feature scaling.',
    title: 'Feature scaling',
    text: 'Area is in the hundreds and parking is 0 or 1, so one learning rate cannot suit both. Z-score scaling fixes that.',
    kind: 'multi',
    scaled: true,
    train: true,
    alpha: { min: -4, max: 0.3, init: -1 },
    defaults: { alphaExp: -1, iters: '200' },
    views: [
      view('Z-score, step by step', VIEWS.zscorePanels),
      view('Cost contours', VIEWS.scaleContour),
      view('Train with and without', VIEWS.scaleTrain),
    ],
    stats: (ctx, c) => [
      { k: 'μ of area', v: ctx.d.mus[0].toFixed(1) },
      { k: 'σ of area', v: ctx.d.sds[0].toFixed(1) },
      { k: 'μ of age', v: ctx.d.mus[2].toFixed(1) },
      { k: 'σ of age', v: ctx.d.sds[2].toFixed(1) },
      { k: 'Cost J', v: n3(c.j) },
    ],
    notation: [
      { s: tex`\mu_j`, m: 'Mean of feature j', c: 'mu = np.mean(X, axis=0)' },
      { s: tex`\sigma_j`, m: 'Standard deviation of feature j', c: 'sigma = np.std(X, axis=0)' },
    ],
    math: [
      { tex: tex`\mu_j = \frac{1}{m}\sum_{i=0}^{m-1} x_j^{(i)}`, why: 'The average value of the feature.' },
      {
        tex: tex`\sigma_j^2 = \frac{1}{m}\sum_{i=0}^{m-1} \left( x_j^{(i)} - \mu_j \right)^2`,
        why: 'The typical spread around that average.',
      },
      {
        tex: tex`x_j^{(i)} := \frac{x_j^{(i)} - \mu_j}{\sigma_j}`,
        why: 'Subtract the mean to center at zero, then divide by the spread. Each feature ends with mean 0 and standard deviation 1.',
      },
      {
        tex: tex`x_{\text{new, scaled}} = \frac{x_{\text{new}} - \mu}{\sigma}`,
        why: 'New apartments must use the same μ and σ from training. This is why they are saved in model.json.',
      },
    ],
    worked: (ctx) => {
      const a = ctx.d.X[0][0];
      return `Area of the first listing: ${a.toFixed(1)} m²\n(${a.toFixed(1)} − ${ctx.d.mus[0].toFixed(1)}) / ${ctx.d.sds[0].toFixed(1)} = ${fixed((a - ctx.d.mus[0]) / ctx.d.sds[0], 3)}`;
    },
    code: [lab('zscore')],
    sk: 'from sklearn.preprocessing import StandardScaler\n\nscaler = StandardScaler()\nX_train = scaler.fit_transform(X_train)\nX_test = scaler.transform(X_test)',
    skNote: 'StandardScaler is this same z-score. Fit it on training rows only, then only transform the rest.',
    tries: [
      {
        label: 'Large α with scaling',
        note: 'Open "Train with and without". Scaled features converge at α = 0.1, while raw ones diverge.',
        set: { alphaExp: -1, iters: '200', view: 2 },
        run: true,
      },
      {
        label: 'Tiny α for both',
        note: 'Both runs survive this α, but with a step this small neither is close to finished after 500 iterations.',
        set: { alphaExp: -4.3, iters: '500', view: 2 },
        run: true,
      },
    ],
  },
  {
    week: 'Course 1, Week 2. Feature engineering and polynomial regression.',
    title: 'Feature engineering',
    text: 'A linear model can fit curves if you give it the right features. Change the degree and watch the shape.',
    ctl: ['degree'],
    noPenalty: true,
    views: [
      view('Fit', VIEWS.polyFit),
      view('Errors', VIEWS.polyResiduals),
      view('x, x², x³ vs price', VIEWS.powers),
    ],
    stats: (ctx, c) => [
      { k: 'Degree', v: String(c.degree) },
      { k: 'Training cost', v: n3(subsetCost(ctx, fitSubset(ctx, c.degree, c.lam))) },
    ],
    notation: [
      { s: tex`x^2,\ x^3`, m: 'New features made from x', c: 'np.c_[x, x**2, x**3]' },
      { s: tex`x_{\text{location}}`, m: 'Area × neighborhood price, this project’s feature', c: 'df.area * per_m2' },
    ],
    math: [
      {
        tex: tex`\text{area} = \text{frontage} \times \text{depth}`,
        why: 'The idea: use what you know about the problem to design a more useful feature.',
      },
      {
        tex: tex`x_{\text{location}} = \text{area} \times \text{median price per m}^2\ \text{of the neighborhood}`,
        why: 'This project’s main feature. The model can now learn how much of the local price level applies.',
      },
      {
        tex: tex`f(x) = w_0\,x + w_1\,x^2 + w_2\,x^3 + b`,
        why: 'Still linear regression. Linear in w, even though it curves in x. Powers have very different ranges, so scale them first.',
      },
    ],
    worked: (ctx, c) => {
      const lookup = ctx.model.location.lookup;
      const per = lookup['saadat-abad'] ?? ctx.model.location.fallback;
      const names = Array.from({ length: c.degree }, (_, i) => (i === 0 ? 'x' : `x^${i + 1}`));
      return `Location feature, example apartment:\n85 m² × ${per.toFixed(1)} million per m² = ${((85 * per) / 1000).toFixed(2)} billion\n\nPolynomial degree: ${c.degree}\nNew features: ${names.join(', ')}`;
    },
    code: [lab('location_lookup'), lab('location_feature'), lab('poly_features')],
    sk: 'from sklearn.preprocessing import PolynomialFeatures\n\npoly = PolynomialFeatures(degree=3, include_bias=False)\nX_poly = poly.fit_transform(X)',
    skNote: 'PolynomialFeatures covers powers and products. The location feature is project-specific, so it stays hand-written.',
    tries: [
      { label: 'Straight line', note: 'Degree 1 is the original model.', set: { degree: 1, view: 0 } },
      { label: 'A gentle curve', note: 'Degree 3 can bend slightly where the data bends.', set: { degree: 3, view: 0 } },
      {
        label: 'Which power fits?',
        note: 'Compare the three panels. The correlation under the plot says which power follows price most closely.',
        set: { view: 2 },
      },
    ],
  },
];
