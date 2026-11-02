import { emptyPlot } from '../../components/Plot';
import type { LabCtx } from '../context';
import { fitSubset, notConverged, POLY_ITERS, predictArea } from '../context';
import type { PolyFit } from '../engine';
import { fmt, mean, niceTop, percentile, range } from '../format';
import { AC, INK, MUT, axes, frame, ln, pt } from '../plotkit';
import type { Domain } from '../plotkit';
import type { Cur, ViewFn } from '../types';
import { TARGET } from './one';

/** Views of the polynomial steps. Every fit here trains on the same 16 listings. */

/** Area range the curves are drawn over: inside the range of the training listings, with a little room. */
export const CURVE_AREA: Domain = [20, 260];

const curve = (ctx: LabCtx, fit: PolyFit, n: number) =>
  range(n, (i) => {
    const a = CURVE_AREA[0] + ((CURVE_AREA[1] - CURVE_AREA[0]) * i) / (n - 1);
    return [a, predictArea(ctx, fit, a)] as [number, number];
  });

const stalled = (fit: PolyFit) =>
  notConverged(fit) ? `Descent had not fully converged after ${POLY_ITERS} iterations, so the curve is still changing slowly.` : '';

/** λ used by a polynomial view: none before regularization is introduced. */
const lamOf = (c: Cur) => c.lam;

export const polyFit: ViewFn = (ctx, c) => {
  const fit = fitSubset(ctx, c.degree, lamOf(c));
  const f = frame(CURVE_AREA, ctx.dom.price);
  const p = axes(f);
  p.points = ctx.sub.area.map((a, i) => pt(f, a, ctx.sub.y[i], { r: 5, fill: INK, op: 1 }));
  p.lines = [ln(f.path(curve(ctx, fit, 120)))];
  p.xLabel = 'Area (m²)';
  p.yLabel = TARGET;
  p.legend = [
    `Degree ${c.degree} fit on ${ctx.sub.area.length} training listings spread across the area range. Parts of the curve beyond the frame are cut off.`,
    stalled(fit),
  ].filter(Boolean);
  return p;
};

export const polyResiduals: ViewFn = (ctx, c) => {
  const fit = fitSubset(ctx, c.degree, lamOf(c));
  const res = ctx.sub.area.map((a, i) => ctx.sub.y[i] - predictArea(ctx, fit, a));
  const m = niceTop(Math.max(...res.map(Math.abs), 1), 4);
  const f = frame(CURVE_AREA, [-m, m]);
  const p = axes(f);
  p.lines = [ln(f.path([[CURVE_AREA[0], 0], [CURVE_AREA[1], 0]]), { stroke: MUT, width: 1 })];
  p.points = ctx.sub.area.map((a, i) => pt(f, a, res[i], { r: 5, fill: AC, op: 1 }));
  p.xLabel = 'Area (m²)';
  p.yLabel = 'Actual minus predicted';
  p.legend = [`Errors of the degree ${c.degree} fit on its ${ctx.sub.area.length} training listings`, stalled(fit)].filter(Boolean);
  return p;
};

function pearson(a: number[], b: number[]): number {
  const ma = mean(a);
  const mb = mean(b);
  let sab = 0;
  let saa = 0;
  let sbb = 0;
  for (let i = 0; i < a.length; i++) {
    sab += (a[i] - ma) * (b[i] - mb);
    saa += (a[i] - ma) ** 2;
    sbb += (b[i] - mb) ** 2;
  }
  return sab / Math.sqrt(saa * sbb || 1);
}

export const powers: ViewFn = (ctx) => {
  const p = emptyPlot();
  const xs = ctx.d.zs.map((z) => z + 2);
  const top = ctx.dom.price[1];
  const corr: string[] = [];
  ['x', 'x²', 'x³'].forEach((t, j) => {
    const l = 60 + j * 225;
    const box = { l, r: l + 176, t: 40, b: 320 };
    const vals = xs.map((v) => v ** (j + 1));
    const f = frame([0, niceTop(percentile(vals, 99))], ctx.dom.price, box);
    p.points = p.points.concat(vals.map((v, i) => pt(f, v, ctx.d.y[i], { r: 2.5, op: 0.6 })));
    p.texts.push({ x: l + 88, y: 28, t, anchor: 'middle', size: 14 });
    p.yTicks = p.yTicks.concat(
      [0, top / 2, top].map((v) => ({ x1: l, x2: l + 176, y: f.y(v), tx: l - 4, ty: f.y(v) + 4, label: fmt(v) })),
    );
    const xt = f.xd[1];
    p.xTicks = p.xTicks.concat(
      [0, xt / 2, xt].map((v) => ({ x: f.x(v), y1: 40, y2: 320, ty: 336, label: fmt(v) })),
    );
    corr.push(`${t} ${pearson(vals, ctx.d.y).toFixed(2)}`);
  });
  p.xLabel = 'Each engineered feature (shifted to stay positive)';
  p.yLabel = TARGET;
  p.legend = [
    'The model is linear in each of these, so the one that looks most like a straight line against price helps most.',
    `Correlation with price: ${corr.join(', ')}.`,
  ];
  return p;
};

export const fitThree: ViewFn = (ctx) => {
  const p = emptyPlot();
  const cases: Array<[number, string]> = [[1, 'Degree 1: underfit'], [3, 'Degree 3: reasonable'], [9, 'Degree 9: overfit']];
  const notes: string[] = [];
  cases.forEach(([deg, title], j) => {
    const l = 60 + j * 225;
    const box = { l, r: l + 176, t: 40, b: 320 };
    const f = frame(CURVE_AREA, ctx.dom.price, box);
    const fit = fitSubset(ctx, deg, 0);
    p.points = p.points.concat(ctx.sub.area.map((a, i) => pt(f, a, ctx.sub.y[i], { r: 3, op: 1 })));
    p.lines.push(ln(f.path(curve(ctx, fit, 80)), { width: 2 }));
    p.texts.push({ x: l + 88, y: 28, t: title, anchor: 'middle', size: 13 });
    p.yTicks = p.yTicks.concat(
      [0, ctx.dom.price[1] / 2, ctx.dom.price[1]].map((v) => ({
        x1: l, x2: l + 176, y: f.y(v), tx: l - 4, ty: f.y(v) + 4, label: j === 0 ? fmt(v) : '',
      })),
    );
    p.xTicks = p.xTicks.concat(
      [CURVE_AREA[0], (CURVE_AREA[0] + CURVE_AREA[1]) / 2, CURVE_AREA[1]].map((v) => ({
        x: f.x(v), y1: 40, y2: 320, ty: 336, label: fmt(v),
      })),
    );
    if (notConverged(fit)) notes.push(String(deg));
  });
  p.xLabel = 'Area (m²)';
  p.yLabel = TARGET;
  p.legend = ['All three see the same training points'];
  if (notes.length > 0) {
    p.legend.push(`Descent had not fully converged for degree ${notes.join(' and ')} after ${POLY_ITERS} iterations.`);
  }
  return p;
};

export const weightBars: ViewFn = (ctx, c) => {
  const a = fitSubset(ctx, c.degree, 0.01).theta.slice(1);
  const b = fitSubset(ctx, c.degree, c.lam).theta.slice(1);
  const m = niceTop(Math.max(...a.concat(b).map(Math.abs), 0.1), 4);
  const f = frame([0.5, c.degree + 0.5], [-m, m]);
  const p = emptyPlot();
  p.yTicks = f.yTicks();
  p.xTicks = range(c.degree, (i) => ({ x: f.x(i + 1), y1: f.b.t, y2: f.b.b, ty: f.b.b + 16, label: `w${i + 1}` }));
  const bw = Math.max(4, 150 / c.degree);
  const bar = (v: number, i: number, off: number, fill: string) => {
    const base = f.cy(0);
    const top = f.cy(v);
    return { x: f.x(i + 1) + off, y: Math.min(base, top), w: bw, h: Math.abs(top - base), fill, stroke: 'none', op: 1 };
  };
  p.bars = a.map((v, i) => bar(v, i, -bw - 1, MUT)).concat(b.map((v, i) => bar(v, i, 1, AC)));
  p.yLabel = 'Weight value';
  p.legend = ['Grey (left of each pair): almost no regularization', 'Accent (right): your λ'];
  const unsettled = [fitSubset(ctx, c.degree, 0.01), fitSubset(ctx, c.degree, c.lam)].some(notConverged);
  if (unsettled) p.legend.push(`Descent had not fully converged after ${POLY_ITERS} iterations for at least one of these fits.`);
  return p;
};
