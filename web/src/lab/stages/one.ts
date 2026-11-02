import { count, fixed, median, n3, sciText } from '../format';
import { lab } from '../snippets';
import type { Stage } from '../types';
import { VIEWS } from '../views';
import { costStats, modelStats, priceText, slopeStats, slopesAt, tex, trainStats, view } from './shared';

/** Steps 1 to 6: one feature, from the data to gradient descent. Training controls start at step 6. */
export const ONE_FEATURE: Stage[] = [
  {
    part: 'One feature',
    week: 'Course 1, Week 1. Project data.',
    title: 'Data and notation',
    text: 'Start by looking at the listings and naming things. Every later step uses these names.',
    ctl: ['bins'],
    views: [
      view('Price histogram', VIEWS.priceHistogram),
      view('Price vs area', VIEWS.priceVsArea),
      view('Price vs age', VIEWS.priceVsAge),
    ],
    stats: (ctx) => [
      { k: 'Rows m', v: count(ctx.d.n) },
      { k: 'Median price', v: median(ctx.d.y).toFixed(2) },
      { k: 'Median area', v: `${median(ctx.d.rows.map((r) => r.area)).toFixed(0)} m²` },
    ],
    notation: [
      { s: tex`x`, m: 'Input feature, here area in hundreds of m²', c: 'x_train' },
      { s: tex`y`, m: 'Target, the asking price in billions', c: 'y_train' },
      { s: tex`m`, m: 'Number of training examples', c: 'm = x_train.shape[0]' },
      { s: tex`x^{(i)},\; y^{(i)}`, m: 'The i-th training example, counting from 0', c: 'x_train[i], y_train[i]' },
    ],
    math: [
      {
        tex: tex`\left(x^{(i)},\; y^{(i)}\right) \quad \text{for } i = 0, 1, \ldots, m-1`,
        why: 'A training set is a list of examples. Each one pairs what we know about an apartment with the price that was asked for it.',
      },
    ],
    worked: (ctx) => {
      const r = ctx.d.rows[0];
      return `x⁽⁰⁾ = ${(r.area / 100).toFixed(2)}   (${r.area.toFixed(0)} m²)\ny⁽⁰⁾ = ${r.price.toFixed(2)} billion\nm    = ${ctx.d.n}`;
    },
    code: [lab('load_xy')],
    sk: '# No scikit-learn step is needed here.\n# pandas handles inspection:\ndf.describe()',
    skNote: 'scikit-learn starts once the data is ready to model.',
    tries: [
      { label: 'Few bins', note: 'A coarse view shows the overall shape.', set: { bins: 6, view: 0 } },
      {
        label: 'Many bins',
        note: 'A fine view reveals the long tail of expensive apartments.',
        set: { bins: 28, view: 0 },
      },
    ],
  },
  {
    week: 'Project step, before training',
    title: 'Cleaning',
    text: 'Some ads contain impossible prices, from fractions of a toman to thousands of billions. Move the bounds and see which listings survive.',
    ctl: ['lo', 'hi'],
    views: [view('Before and after', VIEWS.cleanDist)],
    stats: (ctx, c) => {
      const all = ctx.d.y.concat(ctx.dirty);
      const lo = 10 ** c.lo;
      const hi = 10 ** c.hi;
      const kept = all.filter((v) => v >= lo && v <= hi).length;
      const lost = ctx.d.y.filter((v) => v < lo || v > hi).length;
      return [
        { k: 'Before', v: count(all.length) },
        { k: 'Kept', v: count(kept) },
        { k: 'Removed', v: count(all.length - kept) },
        { k: 'Of the removed, ordinary listings', v: count(lost) },
      ];
    },
    notation: [{ s: tex`\text{low},\ \text{high}`, m: 'Lower and upper price bounds', c: 'low, high' }],
    math: [
      {
        tex: tex`\text{keep row } i \text{ if } \quad \text{low} \le y^{(i)} \le \text{high}`,
        why: 'Impossible prices are usually typing mistakes or placeholders, and they would mislead any model. This step bounds the price itself so there is one dimension to look at. The live model bounds the price per m² instead (see the Data page), which also catches ads whose price looks ordinary.',
      },
    ],
    worked: (ctx, c) => {
      const all = ctx.d.y.concat(ctx.dirty);
      const kept = all.filter((v) => v >= 10 ** c.lo && v <= 10 ** c.hi).length;
      return `Bounds: ${priceText(10 ** c.lo)} to ${priceText(10 ** c.hi)} billion\nKept ${kept} of ${all.length} ads, removed ${all.length - kept}`;
    },
    code: [lab('price_bounds')],
    sk: '# No direct equivalent for domain rules.\n# pandas filters them:\ndf[df.price.between(low, high)]',
    skNote: 'scikit-learn has outlier detection tools, but a written rule is easier to explain and defend.',
    tries: [
      {
        label: 'Keep everything',
        note: 'Every ad stays, including the impossible prices at both ends of the axis.',
        set: { lo: -6, hi: 5 },
      },
      {
        label: 'Too strict',
        note: 'Many genuine listings fall outside the bounds and are removed too, so expensive apartments would be missing from the data.',
        set: { lo: 0.3, hi: 1 },
      },
      {
        label: 'Bounds that keep the sample',
        note: 'Every ordinary listing stays and most impossible prices go. A few impossible ads have prices that look ordinary, which is why the live cleaning also checks price per m².',
        set: { lo: 0, hi: 2.5 },
      },
    ],
  },
  {
    week: 'Course 1, Week 1. Model representation.',
    title: 'The model',
    text: 'A straight line. Set w and b yourself and see which line you get.',
    wb: true,
    views: [view('The line', VIEWS.fit)],
    stats: modelStats,
    notation: [
      { s: tex`w`, m: 'Weight: price change for each extra 100 m²', c: 'w' },
      { s: tex`b`, m: 'Bias: the line’s value at x = 0', c: 'b' },
      { s: tex`f_{w,b}(x)`, m: 'The model’s prediction', c: 'f_wb' },
    ],
    math: [
      {
        tex: tex`f_{w,b}\!\left(x^{(i)}\right) = w\,x^{(i)} + b`,
        why: 'Different values of w and b give different lines.',
      },
    ],
    worked: (ctx, c) => {
      const x = ctx.d.x[0];
      return `For the first listing:\nf(${x.toFixed(2)}) = ${fixed(c.w, 2)} × ${x.toFixed(2)} + ${fixed(c.b, 2)} = ${fixed(c.w * x + c.b, 2)} billion\nActual: ${ctx.d.y[0].toFixed(2)} billion`;
    },
    code: [lab('predict_one')],
    sk: 'from sklearn.linear_model import LinearRegression\n\nmodel = LinearRegression().fit(X_train, y_train)\nmodel.coef_       # w\nmodel.intercept_  # b\nmodel.predict(X)',
    skNote: 'After fitting, scikit-learn stores w in coef_ and b in intercept_.',
    tries: [
      { label: 'Flat line', note: 'w = 0 ignores area, so every apartment gets the same price.', set: { w0: 0, b0: 12 } },
      {
        label: 'Too steep',
        note: 'Large apartments get a far higher price than the listings show.',
        set: { w0: 60, b0: 0 },
      },
      {
        label: 'A plausible line',
        note: 'It follows the main trend of the listings, found just by moving the sliders.',
        set: { w0: 25, b0: -12 },
      },
    ],
  },
  {
    week: 'Course 1, Week 1. Cost function.',
    title: 'Cost function',
    text: 'One number for how wrong the line is. Move w and b and watch the errors and the cost change.',
    wb: true,
    views: [
      view('Line and errors', VIEWS.errors),
      view('J(w) curve', VIEWS.costCurve),
      view('Contour', VIEWS.contour),
      view('Surface', VIEWS.surface),
    ],
    stats: costStats,
    notation: [
      { s: tex`J(w,b)`, m: 'Cost of the current w and b', c: 'total_cost' },
      { s: tex`f\!\left(x^{(i)}\right) - y^{(i)}`, m: 'Error on example i', c: 'f_wb - y[i]' },
    ],
    math: [
      {
        tex: tex`\text{error}^{(i)} = f_{w,b}\!\left(x^{(i)}\right) - y^{(i)}`,
        why: 'How far the prediction is from the actual price, for one apartment.',
      },
      {
        tex: tex`J(w,b) = \frac{1}{2m} \sum_{i=0}^{m-1} \left( f_{w,b}\!\left(x^{(i)}\right) - y^{(i)} \right)^2`,
        why: 'Square each error so large misses count more and signs do not cancel. Average over m. The extra 2 in 2m is a convention.',
      },
      {
        tex: tex`\min_{w,\,b}\; J(w,b)`,
        why: 'The best line is the pair with the lowest cost. Because the errors are squared, the surface is a bowl with a single lowest point.',
      },
    ],
    worked: (ctx, c) => {
      const e = ctx.d.x.slice(0, 3).map((x, i) => c.w * x + c.b - ctx.d.y[i]);
      return `First three squared errors:\n${e.map((v) => `  (${fixed(v, 2)})² = ${(v * v).toFixed(2)}`).join('\n')}\nAdd all ${ctx.d.n}, divide by 2 × ${ctx.d.n}:\nJ = ${n3(c.j)}`;
    },
    code: [lab('cost_one')],
    sk: '# Computed directly from scikit-learn predictions:\nerror = model.predict(X) - y\nJ = (error ** 2).sum() / (2 * len(y))',
    skNote: 'LinearRegression finds the w and b with the lowest value of this cost.',
    tries: [
      {
        label: 'Near the best line',
        note: 'The marker sits in the bottom of the bowl, where the cost is as low as it gets.',
        set: (ctx) => ({ w0: ctx.wp, b0: ctx.bp }),
      },
      {
        label: 'Far away',
        note: 'Cost grows quickly in every direction because errors are squared.',
        set: { w0: 55, b0: 30 },
      },
    ],
  },
  {
    week: 'Course 1, Week 1. Gradient.',
    title: 'Gradient',
    text: 'The gradient is the slope of the cost. It tells each parameter which way is uphill, and how steep it is.',
    wb: true,
    views: [view('Slope on J(w)', VIEWS.tangent), view('Gradient arrows', VIEWS.arrows)],
    stats: slopeStats,
    notation: [
      { s: tex`\frac{\partial J}{\partial w}`, m: 'Slope of cost as w changes', c: 'dj_dw' },
      { s: tex`\frac{\partial J}{\partial b}`, m: 'Slope of cost as b changes', c: 'dj_db' },
    ],
    math: [
      {
        tex: tex`\frac{\partial J}{\partial w} = \frac{1}{m} \sum_{i=0}^{m-1} \left( f_{w,b}\!\left(x^{(i)}\right) - y^{(i)} \right) x^{(i)}`,
        why: 'Each error, multiplied by its input, averaged. Squaring the error brings down a 2, which cancels the 2 in 2m.',
      },
      {
        tex: tex`\frac{\partial J}{\partial b} = \frac{1}{m} \sum_{i=0}^{m-1} \left( f_{w,b}\!\left(x^{(i)}\right) - y^{(i)} \right)`,
        why: 'The same, without the x, because b is not multiplied by x in the model.',
      },
    ],
    worked: (ctx, c) => {
      const g = slopesAt(ctx, c);
      const word = (s: number, p: string) => `${s > 0 ? 'positive' : 'negative'}, so ${s > 0 ? 'lowering' : 'raising'} ${p} lowers cost`;
      return `∂J/∂w = ${n3(g[0])}   ${word(g[0], 'w')}\n∂J/∂b = ${n3(g[1])}   ${word(g[1], 'b')}`;
    },
    code: [lab('gradient_one')],
    sk: '# scikit-learn calculates gradients inside fit().\n# It does not expose them as a separate step.\nmodel.fit(X_train, y_train)',
    skNote: 'No separate call exists. This project checks its own gradient against a numeric estimate in a test.',
    tries: [
      {
        label: 'Left of the minimum',
        note: 'Negative slope, so raising w lowers cost.',
        set: (ctx) => ({ w0: 5, b0: ctx.bp, view: 0 }),
      },
      {
        label: 'Right of the minimum',
        note: 'Positive slope, so lowering w lowers cost.',
        set: (ctx) => ({ w0: 50, b0: ctx.bp, view: 0 }),
      },
      {
        label: 'At the minimum',
        note: 'The slope is near zero, at the bottom of the curve.',
        set: (ctx) => ({ w0: ctx.wp, b0: ctx.bp, view: 0 }),
      },
    ],
  },
  {
    week: 'Course 1, Week 1. Gradient descent.',
    title: 'Gradient descent',
    text: 'Repeat small steps downhill. Choose a start, a learning rate, and the iterations, press Start, and every plot follows.',
    wb: true,
    train: true,
    alpha: { min: -4, max: 0.3, init: -0.5 },
    defaults: { w0: 0, b0: 0 },
    views: [
      view('Fit and errors', VIEWS.errors),
      view('Cost by iteration', VIEWS.gdCost),
      view('Path on contour', VIEWS.contour),
      view('Parameters', VIEWS.gdParams),
    ],
    stats: trainStats,
    notation: [
      { s: tex`\alpha`, m: 'Learning rate, the step size', c: 'alpha' },
      { s: tex`\text{iterations}`, m: 'Number of update steps', c: 'num_iters' },
      { s: tex`J\ \text{history}`, m: 'Cost saved at each step for plotting', c: 'J_history' },
    ],
    math: [
      {
        tex: tex`\begin{aligned} &\text{repeat until convergence:}\\ &\qquad w := w - \alpha\,\frac{\partial J}{\partial w}\\ &\qquad b := b - \alpha\,\frac{\partial J}{\partial b} \end{aligned}`,
        why: 'Subtract the slope, because the slope points uphill. Near the bottom the slope shrinks, so steps shrink too, even though α stays fixed.',
      },
      {
        tex: tex`\begin{aligned} \text{tmp}_w &= w - \alpha\,\frac{\partial J}{\partial w}\\ \text{tmp}_b &= b - \alpha\,\frac{\partial J}{\partial b}\\ w &= \text{tmp}_w\\ b &= \text{tmp}_b \end{aligned}`,
        why: 'Update simultaneously. Both slopes are computed from the old w and b, before either changes.',
      },
    ],
    worked: (ctx, c) => {
      const g = slopesAt(ctx, c);
      return `Iteration ${c.it}:\nw = ${fixed(c.w, 3)} − ${sciText(c.alpha)} × (${n3(g[0])}) = ${fixed(c.w - c.alpha * g[0], 3)}\nb = ${fixed(c.b, 3)} − ${sciText(c.alpha)} × (${n3(g[1])}) = ${fixed(c.b - c.alpha * g[1], 3)}`;
    },
    code: [lab('descent_one')],
    sk: 'from sklearn.linear_model import SGDRegressor\n\nmodel = SGDRegressor(\n    learning_rate="constant",\n    eta0=alpha,\n    max_iter=num_iters,\n    tol=None,\n).fit(X_train, y_train)',
    skNote: 'SGDRegressor updates after each example (stochastic), while this project uses all examples per step (batch). Results are close, not identical.',
    tries: [
      {
        label: 'A good learning rate',
        note: 'Cost falls quickly, then flattens as the slope shrinks.',
        set: { w0: 0, b0: 0, alphaExp: -0.5, iters: '200' },
        run: true,
      },
      {
        label: 'Very small α',
        note: 'Stable but slow. Cost is still high when the run ends.',
        set: { w0: 0, b0: 0, alphaExp: -3, iters: '200' },
        run: true,
      },
      {
        label: 'α too large',
        note: 'Each step overshoots, w jumps side to side, and cost grows until it diverges.',
        set: { w0: 0, b0: 0, alphaExp: 0.1, iters: '40' },
        run: true,
      },
    ],
  },
];
