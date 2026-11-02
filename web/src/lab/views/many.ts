import { emptyPlot } from '../../components/Plot';
import { multiRun } from '../context';
import { count, fmt, mean, niceSpan, niceTop } from '../format';
import { AC, INK, MUT, axes, ellipse, frame, ln, pt, signedBars } from '../plotkit';
import type { Domain } from '../plotkit';
import type { ViewFn } from '../types';
import { TARGET } from './one';

/** Views of the second part: many features, vectorization, learning rate and scaling. */

export const FEATS = ['Area (m²)', 'Bedrooms', 'Age (years)', 'Parking (0 or 1)'];
/** Weights for the dot-product picture: billions of toman per m², per bedroom, per year, for parking. */
export const DOT_WEIGHTS = [0.15, 1.5, -0.3, 2];

export const dotProduct: ViewFn = (ctx, c) => {
  const x = ctx.d.X[Math.min(c.row, ctx.d.n - 1)];
  const vals = x.map((v, j) => v * DOT_WEIGHTS[j]);
  const m = niceTop(Math.max(1, ...vals.map(Math.abs)), 4);
  const f = frame([0, 4], [-m, m]);
  const p = emptyPlot();
  p.yTicks = f.yTicks();
  p.xTicks = FEATS.map((label, i) => ({ x: f.x(i + 0.5), y1: f.b.b, y2: f.b.b, ty: f.b.b + 16, label }));
  p.bars = signedBars(f, vals);
  p.texts = vals.map((v, i) => ({
    x: f.x(i + 0.5),
    y: (v > 0 ? f.cy(v) : f.cy(0)) - 6,
    t: v.toFixed(2),
    anchor: 'middle' as const,
    size: 14,
  }));
  p.yLabel = 'wⱼ · xⱼ';
  p.legend = ['The dot product is the sum of these bars. Weights here are illustrative.'];
  return p;
};

export const shapes: ViewFn = (_ctx, c) => {
  const p = emptyPlot();
  const box = (x: number, y: number, w: number, h: number, t: string, sub: string) => {
    p.bars.push({ x, y, w, h, fill: 'var(--acs)', stroke: INK, op: 0.9 });
    p.texts.push({ x: x + w / 2, y: y + h / 2 + 5, t, anchor: 'middle', size: 18 });
    p.texts.push({ x: x + w / 2, y: y + h + 22, t: sub, anchor: 'middle', size: 13 });
  };
  const bw = 60 + c.nf * 16;
  const bh = 90 + Math.log10(c.m) * 40;
  box(50, 50, bw, bh, 'X', `${count(c.m)} × ${c.nf}`);
  p.texts.push({ x: 70 + bw, y: 50 + bh / 2 + 6, t: '·', anchor: 'middle', size: 30 });
  box(90 + bw, 110, 46, 40 + c.nf * 8, 'w', `${c.nf} × 1`);
  p.texts.push({ x: 180 + bw, y: 50 + bh / 2 + 6, t: '+ b =', anchor: 'middle', size: 18 });
  box(225 + bw, 50, 56, bh, 'ŷ', `${count(c.m)} × 1`);
  p.legend = ['One matrix product replaces a loop over every row and feature'];
  return p;
};

export const featurePanels: ViewFn = (ctx, c) => {
  const p = emptyPlot();
  const doms: Domain[] = [ctx.dom.area, [0, 6], ctx.dom.age, [-0.2, 1.2]];
  const cur = c.histM[c.histM.length - 1];
  const rows = ctx.panel;
  for (let j = 0; j < 4; j++) {
    const col = j % 2;
    const row = j < 2 ? 0 : 1;
    const box = { l: 60 + col * 335, r: 345 + col * 335, t: 22 + row * 178, b: 158 + row * 178 };
    const f = frame(doms[j], ctx.dom.price, box);
    p.points = p.points.concat(rows.map((i) => pt(f, ctx.d.X[i][j], ctx.d.y[i], { r: 2.5, op: 0.6 })));
    if (cur) {
      p.points = p.points.concat(
        rows.map((i) =>
          pt(f, ctx.d.X[i][j], ctx.d.X[i].reduce((s, v, q) => s + v * cur.w[q], cur.b), { r: 2.5, fill: AC, op: 1 }),
        ),
      );
    }
    p.texts.push({ x: (box.l + box.r) / 2, y: box.t - 6, t: FEATS[j], anchor: 'middle', size: 13 });
    const top = ctx.dom.price[1];
    p.yTicks = p.yTicks.concat(
      [0, top / 2, top].map((v) => ({ x1: box.l, x2: box.r, y: f.y(v), tx: box.l - 6, ty: f.y(v) + 4, label: fmt(v) })),
    );
  }
  p.yLabel = TARGET;
  p.legend = ['Dark dots: actual price', 'Accent dots: model prediction at this iteration'];
  if (ctx.d.n > rows.length) p.legend.push(`Every ${Math.ceil(ctx.d.n / rows.length)}th listing is drawn.`);
  return p;
};

export const multiCost: ViewFn = (ctx, c) => {
  const f = frame([0, c.iters], [0, niceTop((c.histM[0]?.j ?? ctx.jZero) * 1.05)]);
  const p = axes(f);
  p.lines = [ln(f.path(c.histM.map((q, i) => [i, q.j] as [number, number])))];
  p.points = [pt(f, c.it, c.j, { r: 6, fill: AC, op: 1 })];
  p.xLabel = 'Iteration';
  p.yLabel = 'Cost J';
  p.legend = ['Cost still falling at the end means more iterations would help'];
  return p;
};

export const multiWeights: ViewFn = (_ctx, c) => {
  const w = c.histM[c.histM.length - 1].w;
  const m = niceTop(Math.max(0.1, ...w.map(Math.abs)), 4);
  const f = frame([0, 4], [-m, m]);
  const p = emptyPlot();
  p.yTicks = f.yTicks((v) => v.toFixed(2));
  p.xTicks = FEATS.map((label, i) => ({ x: f.x(i + 0.5), y1: f.b.b, y2: f.b.b, ty: f.b.b + 16, label }));
  p.bars = signedBars(f, w);
  p.yLabel = 'Weight wⱼ';
  p.legend = ['One weight per feature, at the current iteration'];
  return p;
};

const STYLES: Array<[string, string]> = [[MUT, '2 4'], [INK, '6 4'], [AC, ''], [MUT, ''], [INK, '2 2'], [AC, '8 3']];
const STYLE_NAMES = ['dotted grey', 'dashed', 'solid accent', 'solid grey', 'dotted', 'long dash accent'];

export const lrCurves: ViewFn = (ctx, c) => {
  const f = frame([0, c.iters], [0, niceTop(ctx.jZero * 1.05)]);
  const p = axes(f);
  p.lines = c.lrs.map((a, i) => {
    const r = multiRun(ctx, false, a, c.iters);
    const st = STYLES[i % STYLES.length];
    return ln(f.path(r.h.slice(0, c.it + 1).map((q, k) => [k, q.j] as [number, number])), { stroke: st[0], dash: st[1], width: 2 });
  });
  p.xLabel = 'Iteration';
  p.yLabel = 'Cost J';
  p.legend = c.lrs.map((a, i) => `${STYLE_NAMES[i % STYLE_NAMES.length]}: α = ${a}`);
  return p;
};

export const lrW0: ViewFn = (ctx, c) => {
  const span = Math.min(c.iters, 30);
  const runs = c.lrs.map((a) => multiRun(ctx, false, a, c.iters));
  // The axis fits the runs that settle. A run that diverges leaves the frame, which is the point.
  const seen = runs.filter((r) => r.diverged === null).flatMap((r) => r.h.slice(0, span + 1).map((q) => q.w[0]));
  const [lo, hi] = niceSpan(Math.min(-0.05, ...seen), Math.max(0.25, ...seen));
  const f = frame([0, span], [lo, hi]);
  const p = axes(f, undefined, (v) => v.toFixed(2));
  p.lines = c.lrs.map((_a, i) => {
    const st = STYLES[i % STYLES.length];
    return ln(f.path(runs[i].h.slice(0, Math.min(c.it, span) + 1).map((q, k) => [k, q.w[0]] as [number, number])), {
      stroke: st[0], dash: st[1], width: 2,
    });
  });
  p.xLabel = 'Iteration (first 30)';
  p.yLabel = 'w₀, the area weight';
  p.legend = ['Zig-zag means each step jumps past the best value', 'Growing zig-zag means divergence'];
  return p;
};

export const zscorePanels: ViewFn = (ctx) => {
  const a = ctx.d.X.map((r) => r[0]);
  const g = ctx.d.X.map((r) => r[2]);
  const mua = ctx.d.mus[0];
  const mug = ctx.d.mus[2];
  const p = emptyPlot();
  const rows = ctx.panel;
  const panel = (i: number, title: string, xs: number[], ys: number[], xd: Domain, yd: Domain) => {
    const l = 60 + i * 225;
    const box = { l, r: l + 176, t: 40, b: 320 };
    const f = frame(xd, yd, box);
    p.points = p.points.concat(rows.map((k) => pt(f, xs[k], ys[k], { r: 2.5, op: 0.6 })));
    p.texts.push({ x: l + 88, y: 28, t: title, anchor: 'middle', size: 14 });
    p.yTicks = p.yTicks.concat(
      [yd[0], (yd[0] + yd[1]) / 2, yd[1]].map((v) => ({ x1: l, x2: l + 176, y: f.y(v), tx: l - 4, ty: f.y(v) + 4, label: fmt(v) })),
    );
    p.xTicks = p.xTicks.concat(
      [xd[0], (xd[0] + xd[1]) / 2, xd[1]].map((v) => ({ x: f.x(v), y1: 40, y2: 320, ty: 336, label: fmt(v) })),
    );
  };
  panel(0, 'Raw', a, g, [0, 400], [-200, 200]);
  panel(1, 'x − μ', a.map((v) => v - mua), g.map((v) => v - mug), [-100, 300], [-200, 200]);
  panel(2, '(x − μ) / σ', a.map((v) => (v - mua) / ctx.d.sds[0]), g.map((v) => (v - mug) / ctx.d.sds[2]), [-2, 6], [-3, 3]);
  p.xLabel = 'Area';
  p.yLabel = 'Age';
  p.legend = [
    'Left and middle use one equal scale, so area dominates',
    'Right: both features are centered with a similar spread',
  ];
  return p;
};

/** Eigenvalues of the symmetric matrix [[a, b], [b, c]], smallest first. */
function eig2(a: number, b: number, c: number): [number, number] {
  const mid = (a + c) / 2;
  const rad = Math.sqrt(((a - c) / 2) ** 2 + b * b);
  return [mid - rad, mid + rad];
}

export const scaleContour: ViewFn = (ctx) => {
  const area = ctx.d.X.map((r) => r[0]);
  const age = ctx.d.X.map((r) => r[2]);
  const za = ctx.d.Xz.map((r) => r[0]);
  const zg = ctx.d.Xz.map((r) => r[2]);
  const raw: [number, number, number] = [
    mean(area.map((v) => v * v)), mean(area.map((v, i) => v * age[i])), mean(age.map((v) => v * v)),
  ];
  const scaled: [number, number, number] = [1, mean(za.map((v, i) => v * zg[i])), 1];
  const f1 = frame([-11, 11], [-11, 11], { l: 64, r: 370, t: 34, b: 348 });
  const f2 = frame([-11, 11], [-11, 11], { l: 420, r: 700, t: 34, b: 348 });
  const radii = [2.5, 5, 7.5, 10];
  const levels = (h: [number, number, number]) => {
    const [lo] = eig2(...h);
    return radii.map((r) => (lo * r * r) / 2);
  };
  const [rLo, rHi] = eig2(...raw);
  const [sLo, sHi] = eig2(...scaled);
  const p = emptyPlot();
  p.lines = levels(raw)
    .map((l) => ln(ellipse(f1, raw, [0, 0], l), { stroke: MUT, width: 1.5 }))
    .concat(levels(scaled).map((l) => ln(ellipse(f2, scaled, [0, 0], l), { width: 1.5 })));
  p.texts = [
    { x: 217, y: 22, t: 'Before: long and narrow', anchor: 'middle', size: 14 },
    { x: 560, y: 22, t: 'After: round', anchor: 'middle', size: 14 },
  ];
  p.xLabel = 'Distance from best area weight';
  p.yLabel = 'Distance from best age weight';
  p.legend = [
    'Round contours give gradient descent a direct path',
    `The long side is ${(Math.sqrt(rHi / rLo)).toFixed(0)} times the short side before and ${Math.sqrt(sHi / sLo).toFixed(2)} times after.`,
  ];
  return p;
};

export const scaleTrain: ViewFn = (ctx, c) => {
  const raw = multiRun(ctx, false, c.alpha, c.iters);
  const sc = multiRun(ctx, true, c.alpha, c.iters);
  const f = frame([0, c.iters], [0, niceTop(ctx.jZero * 1.05)]);
  const p = axes(f);
  p.lines = [
    ln(f.path(sc.h.slice(0, c.it + 1).map((q, i) => [i, q.j] as [number, number]))),
    ln(f.path(raw.h.slice(0, c.it + 1).map((q, i) => [i, q.j] as [number, number])), { stroke: INK, dash: '6 4' }),
  ];
  p.xLabel = 'Iteration';
  p.yLabel = 'Cost J';
  p.legend = [
    'Solid: z-score scaled',
    'Dashed: raw features',
    sc.diverged !== null ? `Scaled features diverged at iteration ${sc.diverged}` : '',
    raw.diverged !== null ? `Raw features diverged at iteration ${raw.diverged}` : 'Same α for both',
  ].filter(Boolean);
  return p;
};
