import { fitSubset, subsetCost } from '../context';
import { count, fixed, n3, sciText } from '../format';
import { lab } from '../snippets';
import type { Stage } from '../types';
import { VIEWS } from '../views';
import { degreeSweep, lambdaRows } from '../views/heldout';
import { tex, view } from './shared';

/** Steps 12 to 14: overfitting, regularization and the held-out result. */

const fitStats: Stage['stats'] = (ctx, c) => [
  { k: 'Degree', v: String(c.degree) },
  { k: 'Training cost', v: n3(subsetCost(ctx, fitSubset(ctx, c.degree, c.lam))) },
];

export const GENERALIZING: Stage[] = [
  {
    part: 'Generalizing',
    week: 'Course 1, Week 3. The problem of overfitting.',
    title: 'Overfitting',
    text: 'A very flexible model can memorize training points and still fail on new ones.',
    ctl: ['degree'],
    noPenalty: true,
    views: [view('Under, right, over', VIEWS.fitThree), view('Your degree', VIEWS.polyFit)],
    stats: fitStats,
    notation: [
      { s: tex`\text{underfit}`, m: 'Too simple, misses the pattern even in training data', c: '' },
      { s: tex`\text{overfit}`, m: 'Follows the training data so closely it will not generalize', c: '' },
    ],
    math: [
      {
        tex: tex`\text{Underfit: high bias.} \qquad \text{Overfit: high variance.}`,
        why: 'A lower training cost is not always good news. Look at the curve between the points.',
      },
      {
        tex: tex`\text{Remedies: collect more data, or use fewer and simpler features}`,
        why: 'This project prefers a few well-chosen features over many.',
      },
    ],
    worked: (ctx, c) => {
      const fit = fitSubset(ctx, c.degree, 0);
      return `Degree ${c.degree}:\nFeatures used: ${c.degree}\nTraining cost: ${n3(subsetCost(ctx, fit))}`;
    },
    code: [lab('fit_degrees')],
    sk: 'from sklearn.preprocessing import PolynomialFeatures\nfrom sklearn.linear_model import LinearRegression\n\nX_poly = PolynomialFeatures(degree=9, include_bias=False).fit_transform(X)\nLinearRegression().fit(X_poly, y)',
    skNote: 'scikit-learn fits a degree 9 model without any warning. Noticing overfitting is your job.',
    tries: [
      {
        label: 'Underfit',
        note: 'Degree 1 is a straight line, so it cannot bend with the data. It has the highest training cost of the three.',
        set: { degree: 1, view: 1 },
      },
      {
        label: 'Overfit',
        note: 'Degree 9 has the lowest training cost of the three, and the curve bends sharply and swings far from the points.',
        set: { degree: 9, view: 1 },
      },
    ],
  },
  {
    week: 'Course 1, Week 3. Regularization.',
    title: 'Regularization',
    text: 'Keep the flexible model, but penalize large weights. Raise λ and watch the curve calm down.',
    ctl: ['degree', 'lam'],
    views: [view('Fit', VIEWS.polyFit), view('Weight sizes', VIEWS.weightBars)],
    stats: (ctx, c) => {
      const fit = fitSubset(ctx, c.degree, c.lam);
      return [
        { k: 'λ', v: sciText(c.lam) },
        { k: 'Training cost', v: n3(subsetCost(ctx, fit)) },
        { k: 'Largest |w|', v: Math.max(...fit.theta.slice(1).map(Math.abs)).toFixed(2) },
      ];
    },
    notation: [
      { s: tex`\lambda`, m: 'Regularization strength', c: 'lambda_' },
      { s: tex`\sum_j w_j^2`, m: 'Sum of squared weights, not including b', c: 'penalty += w[j] ** 2' },
    ],
    math: [
      {
        tex: tex`J(w,b) = \frac{1}{2m} \sum_{i} \left( f\!\left(x^{(i)}\right) - y^{(i)} \right)^2 + \frac{\lambda}{2m} \sum_{j} w_j^2`,
        why: 'The first term fits the data. The second keeps weights small. λ sets the balance, and b is not regularized.',
      },
      {
        tex: tex`\begin{aligned} \frac{\partial J}{\partial w_j} &= \frac{1}{m} \sum_{i} \left( f\!\left(x^{(i)}\right) - y^{(i)} \right) x_j^{(i)} + \frac{\lambda}{m}\, w_j\\[4pt] \frac{\partial J}{\partial b} &= \frac{1}{m} \sum_{i} \left( f\!\left(x^{(i)}\right) - y^{(i)} \right) \end{aligned}`,
        why: 'Only the w slopes change. Each update now shrinks wⱼ slightly.',
      },
      {
        tex: tex`w_j := w_j \left( 1 - \frac{\alpha\lambda}{m} \right) - \alpha\,\frac{1}{m} \sum_{i} \left( f\!\left(x^{(i)}\right) - y^{(i)} \right) x_j^{(i)}`,
        why: 'The same update rearranged. The factor below 1 is what shrinks the weight on every step.',
      },
    ],
    worked: (ctx, c) => {
      const fit = fitSubset(ctx, c.degree, c.lam);
      const sq = fit.theta.slice(1).reduce((a, v) => a + v * v, 0);
      const m = ctx.sub.z.length;
      const pen = (c.lam / (2 * m)) * sq;
      const fitTerm = subsetCost(ctx, fit);
      return `Σⱼ wⱼ² = ${sq.toFixed(3)}\nPenalty = ${sciText(c.lam)} / (2 × ${m}) × ${sq.toFixed(3)} = ${pen.toFixed(3)}\nFit term = ${n3(fitTerm)}\nTotal J = ${n3(fitTerm + pen)}`;
    },
    code: [lab('compute_cost_reg'), lab('compute_gradient_reg'), lab('gradient_descent')],
    sk: 'from sklearn.linear_model import Ridge\n\nmodel = Ridge(alpha=lambda_).fit(X_train, y_train)',
    skNote: 'With this cost function, Ridge’s alpha equals λ. Note that alpha means λ here, not the learning rate.',
    tries: [
      {
        label: 'Almost no penalty',
        note: 'Degree 9 with a tiny λ: the curve swings, and the weights are the largest of the three settings here.',
        set: { degree: 9, lamExp: -2, view: 0 },
      },
      {
        label: 'A moderate λ',
        note: 'The same model, now smoother, with smaller weights.',
        set: { degree: 9, lamExp: 1, view: 0 },
      },
      {
        label: 'Too much',
        note: 'All weights shrink toward zero, and the model underfits.',
        set: { degree: 9, lamExp: 3, view: 0 },
      },
    ],
  },
  {
    week: 'Project step, using everything above',
    title: 'Held-out result',
    text: 'The final check uses listings the model never trained on. The first two views check the live model; the cost by degree view is a sandbox on the small sample, and it uses your degree and λ from the previous steps.',
    ctl: (v) => (v === 2 ? ['split'] : []),
    views: [
      view('Predicted vs actual', VIEWS.predictedVsActual),
      view('Error histogram', VIEWS.errorHistogram),
      view('Cost by degree', VIEWS.costByDegree),
      view('Cost by λ', VIEWS.costByLambda),
    ],
    stats: (ctx, c) => {
      const m = ctx.model;
      if (c.view === 2) {
        const sweep = degreeSweep(ctx, c.split, c.lam);
        return [
          { k: 'Sandbox training rows', v: count(sweep.k) },
          { k: 'Sandbox held-out rows', v: count(ctx.d.n - sweep.k) },
          { k: `Training cost, degree ${c.degree}`, v: n3(sweep.train[c.degree - 1]) },
          { k: `Held-out cost, degree ${c.degree}`, v: n3(sweep.held[c.degree - 1]) },
        ];
      }
      if (c.view === 3) {
        const chosen = lambdaRows(ctx).find((r) => r.chosen);
        return [
          { k: 'Live model λ', v: m.hyperparameters ? String(m.hyperparameters.lambda) : 'unknown' },
          { k: 'Training cost', v: chosen ? n3(chosen.train_cost as number) : 'unknown' },
          { k: 'Cost on a month it did not train on', v: chosen ? n3(chosen.selection_cost as number) : 'unknown' },
        ];
      }
      return [
        { k: 'Training rows', v: m.rows ? count(m.rows.train) : 'unknown' },
        { k: 'Held-out rows', v: m.rows ? count(m.rows.held_out) : 'unknown' },
        { k: 'Training cost', v: m.cost ? n3(m.cost.train) : 'unknown' },
        { k: 'Held-out cost', v: m.cost ? n3(m.cost.held_out) : 'unknown' },
        { k: 'Listings plotted', v: count(ctx.listings.length) },
      ];
    },
    notation: [{ s: tex`J_{\text{held-out}}`, m: 'Cost on rows never used for training', c: 'plain_cost(fit, held)' }],
    math: [
      {
        tex: tex`J_{\text{held-out}} = \frac{1}{2m_h} \sum_{i} \left( f\!\left(x^{(i)}\right) - y^{(i)} \right)^2`,
        why: 'The same formula, on held-out rows, with no regularization term, because we are measuring the fit and not training.',
      },
    ],
    worked: (ctx) => {
      const l = ctx.listings[0];
      return `First held-out listing shown (${l.neighborhood}, ${l.area} m²):\nModel estimate: ${fixed(l.model, 2)} billion\nActual asking price: ${fixed(l.asked, 2)} billion\n\nWhole held-out set (${ctx.model.rows ? count(ctx.model.rows.held_out) : '?'} listings):\nHeld-out cost ${ctx.model.cost ? n3(ctx.model.cost.held_out) : '?'}`;
    },
    code: [lab('split_by_month'), lab('evaluate_held_out')],
    sk: 'error = model.predict(X_held_out) - y_held_out\nJ_held_out = (error ** 2).sum() / (2 * len(y_held_out))',
    skNote: 'This project splits by month instead of using train_test_split, because prices change over time.',
    tries: [
      {
        label: 'Less training data',
        note: 'Half the sample trains and half checks. The held-out rows change with the share, so compare the shape across degrees, not the exact costs.',
        set: { split: 50, view: 2 },
      },
      {
        label: 'More training data',
        note: 'Few rows are left to check, and a check on few rows is a less reliable estimate.',
        set: { split: 90, view: 2 },
      },
    ],
  },
];
