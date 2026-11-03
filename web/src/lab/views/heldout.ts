import { emptyPlot } from '../../components/Plot';
import type { LabCtx } from '../context';
import { fitFirst, heldCost, notConverged, POLY_ITERS, splitRows } from '../context';
import { hist, polyCost } from '../engine';
import { fixed, fmt, median, niceTop, percentile, range } from '../format';
import { AC, INK, MUT, axes, frame, histBars, ln, pt } from '../plotkit';
import type { ViewFn } from '../types';

/** Views of the final step. Predicted vs actual, errors and cost by lambda use the shipped model's own data. */

/** Sweeps of the sandbox: degrees 1 to 10. */
export const DEGREES = range(10, (i) => i + 1);

export const predictedVsActual: ViewFn = (ctx) => {
  const asked = ctx.listings.map((l) => l.asked);
  const model = ctx.listings.map((l) => l.model);
  const top = niceTop(percentile(asked.concat(model), 98));
  const f = frame([0, top], [0, top]);
  const p = axes(f);
  p.lines = [ln(f.path([[0, 0], [top, top]]), { stroke: MUT, dash: '6 4', width: 1.5 })];
  p.points = ctx.listings.map((l) => pt(f, l.model, l.asked, { fill: AC, r: 4.5 }));
  p.xLabel = 'Model estimate (billion toman)';
  p.yLabel = 'Actual asking price (billion toman)';
  const out = ctx.listings.filter((l) => l.model > top || l.asked > top || l.model < 0).length;
  p.legend = [
    'Dashed: a perfect estimate',
    `Dots: ${ctx.listings.length} listings the live model did not train on, estimated by the live model`,
  ];
  if (out > 0) p.legend.push(`${out} listing${out === 1 ? ' is' : 's are'} beyond the frame and drawn on its edge.`);
  return p;
};

export const errorHistogram: ViewFn = (ctx) => {
  const e = ctx.listings.map((l) => l.asked - l.model);
  const bound = niceTop(percentile(e.map(Math.abs), 95), 4);
  const counts = hist(e, -bound, bound, 16);
  const f = frame([-bound, bound], [0, niceTop(Math.max(...counts, 1))]);
  const p = axes(f);
  p.bars = histBars(f, counts, -bound, bound, AC);
  p.xLabel = 'Actual minus live model estimate (billion toman)';
  p.yLabel = 'Listings';
  const out = e.filter((v) => Math.abs(v) >= bound).length;
  p.legend = [
    `Median of actual minus estimate: ${fixed(median(e), 2)} billion across ${e.length} listings. Near zero means no consistent bias.`,
  ];
  if (out > 0) p.legend.push(`${out} listing${out === 1 ? ' is' : 's are'} beyond the frame and not shown.`);
  return p;
};

/** Training and held-out cost for degrees 1 to 10 on the sandbox split. */
export function degreeSweep(ctx: LabCtx, split: number, lambda: number) {
  const k = splitRows(ctx, split);
  const train = DEGREES.map((deg) => polyCost(fitFirst(ctx, k, deg, lambda), ctx.d.zs.slice(0, k), ctx.d.y.slice(0, k)));
  const held = DEGREES.map((deg) => heldCost(ctx, fitFirst(ctx, k, deg, lambda), k));
  return { k, train, held };
}

export const costByDegree: ViewFn = (ctx, c) => {
  const { train, held } = degreeSweep(ctx, c.split, c.lam);
  const f = frame([1, 10], [0, niceTop(Math.max(...train, ...held, 1))]);
  const p = axes(f);
  p.xTicks = DEGREES.map((q) => ({ x: f.x(q), y1: f.b.t, y2: f.b.b, ty: f.b.b + 16, label: String(q) }));
  p.lines = [
    ln(f.path(DEGREES.map((q, i) => [q, train[i]] as [number, number])), { stroke: INK, dash: '6 4' }),
    ln(f.path(DEGREES.map((q, i) => [q, held[i]] as [number, number]))),
  ];
  p.points = [pt(f, c.degree, held[c.degree - 1], { r: 7, fill: AC, op: 1 })];
  p.xLabel = 'Polynomial degree';
  p.yLabel = 'Cost J (sandbox sample)';
  const best = held.indexOf(Math.min(...held)) + 1;
  const k = splitRows(ctx, c.split);
  const slow = DEGREES.filter((d) => notConverged(fitFirst(ctx, k, d, c.lam)));
  p.legend = [
    'Sandbox: fits on the first part of the 500-listing sample, checked on the rest',
    'Dashed: training cost',
    'Solid: held-out cost',
    'Marker: your degree',
    `Lowest held-out cost: degree ${best}.`,
  ];
  if (slow.length > 0) {
    p.legend.push(`Descent had not fully converged after ${POLY_ITERS} iterations for degree ${slow.join(', ')}.`);
  }
  return p;
};

/** The shipped model's candidates that use its features, in order of lambda. */
export function lambdaRows(ctx: LabCtx) {
  const feats = ctx.model.features.join(',');
  return (ctx.model.candidates ?? [])
    .filter((c) => c.features.join(',') === feats && c.train_cost !== null && c.selection_cost !== null)
    .sort((a, b) => a.lambda - b.lambda);
}

export const costByLambda: ViewFn = (ctx) => {
  const rows = lambdaRows(ctx);
  const p = emptyPlot();
  if (rows.length < 2) {
    p.legend = ['The model file has no candidates for this feature set.'];
    return p;
  }
  const costs = rows.flatMap((r) => [r.train_cost as number, r.selection_cost as number]);
  const f = frame([0, rows.length - 1], [0, niceTop(Math.max(...costs))]);
  p.yTicks = f.yTicks();
  p.xTicks = rows.map((r, i) => ({ x: f.x(i), y1: f.b.t, y2: f.b.b, ty: f.b.b + 16, label: fmt(r.lambda) }));
  p.lines = [
    ln(f.path(rows.map((r, i) => [i, r.train_cost as number] as [number, number])), { stroke: INK, dash: '6 4' }),
    ln(f.path(rows.map((r, i) => [i, r.selection_cost as number] as [number, number]))),
  ];
  const chosen = rows.findIndex((r) => r.chosen);
  if (chosen >= 0) p.points = [pt(f, chosen, rows[chosen].selection_cost as number, { r: 7, fill: AC, op: 1 })];
  p.xLabel = 'λ candidates 0, 10, 100, 1000, 10000 (spaced evenly on the axis)';
  p.yLabel = 'Cost J (live model)';
  const sel = rows.map((r) => r.selection_cost as number);
  const spread = Math.max(...sel) - Math.min(...sel);
  p.legend = [
    'Live model: the features and data it was really trained on',
    'Dashed: training cost',
    'Solid: cost on a month the model did not train on',
    'Marker: the λ the live model uses',
    `The solid line moves by only ${spread.toFixed(2)} across these values of λ.`,
  ];
  return p;
};
