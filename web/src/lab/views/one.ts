import type { PlotSpec } from '../../components/Plot';
import { emptyPlot } from '../../components/Plot';
import type { LabCtx } from '../context';
import { hist } from '../engine';
import { fmt, niceSpan, niceTop, pow10Label, range } from '../format';
import { AC, INK, MUT, axes, ellipse, frame, histBars, ln, pt } from '../plotkit';
import type { Domain } from '../plotkit';
import type { Cur, ViewFn } from '../types';

/** Views of the first part: one feature, from the data to gradient descent. */

export const TARGET = 'Asking price (billion toman)';

const beyondNote = (n: number) =>
  n > 0 ? `${n} listing${n === 1 ? ' is' : 's are'} beyond the frame and drawn on its edge.` : null;

/** The domain the w-b plots share: centred on the best line, half-widths chosen to show the whole bowl. */
export function wbDomains(ctx: LabCtx): { w: Domain; b: Domain } {
  const cw = Math.round(ctx.wp / 10) * 10;
  const cb = Math.round(ctx.bp / 10) * 10;
  return { w: [cw - 40, cw + 40], b: [cb - 60, cb + 60] };
}

/** The ring levels, as cost above the lowest cost. */
const RING_LEVELS = [4, 16, 50, 130, 300];

function rings(ctx: LabCtx, f: ReturnType<typeof frame>) {
  return RING_LEVELS.map((l) => ln(ellipse(f, [ctx.mx2, ctx.mx, 1], [ctx.wp, ctx.bp], l), { stroke: MUT, width: 1 }));
}

const cost1 = (ctx: LabCtx, w: number, b: number) => {
  let s = 0;
  for (let i = 0; i < ctx.d.n; i++) s += (w * ctx.d.x[i] + b - ctx.d.y[i]) ** 2;
  return s / (2 * ctx.d.n);
};
const grad1 = (ctx: LabCtx, w: number, b: number): [number, number] => {
  let gw = 0;
  let gb = 0;
  for (let i = 0; i < ctx.d.n; i++) {
    const e = w * ctx.d.x[i] + b - ctx.d.y[i];
    gw += e * ctx.d.x[i];
    gb += e;
  }
  return [gw / ctx.d.n, gb / ctx.d.n];
};

export const priceHistogram: ViewFn = (ctx, c) => {
  const dom = ctx.dom.price;
  const counts = hist(ctx.d.y, dom[0], dom[1], c.bins);
  const f = frame(dom, [0, niceTop(Math.max(...counts, 1))]);
  const p = axes(f);
  p.bars = histBars(f, counts, dom[0], dom[1], AC);
  p.xLabel = TARGET;
  p.yLabel = 'Listings';
  p.legend = ['Change the bin count to see the shape differently'];
  if (ctx.beyond.price > 0) {
    p.legend.push(`${ctx.beyond.price} listings above ${fmt(dom[1])} billion are not shown.`);
  }
  return p;
};

export function scatter(key: 'area' | 'age', label: string): ViewFn {
  return (ctx) => {
    const xd = ctx.dom[key];
    const f = frame(xd, ctx.dom.price);
    const p = axes(f);
    p.points = ctx.d.rows.map((r) => pt(f, r[key], r.price, { r: 3.5, op: 0.6 }));
    p.xLabel = label;
    p.yLabel = TARGET;
    const out = ctx.d.rows.filter((r) => r[key] > xd[1] || r.price > ctx.dom.price[1]).length;
    p.legend = ['Each dot is one listing', beyondNote(out) ?? ''].filter(Boolean);
    return p;
  };
}

/** Log10 prices from 10^-6 to 10^5 in half-decade bins. */
const LOG_LO = -6;
const LOG_HI = 5;
const LOG_BINS = 22;

export const cleanDist: ViewFn = (ctx, c) => {
  const all = ctx.d.y.concat(ctx.dirty).filter((v) => v > 0);
  const lo = 10 ** c.lo;
  const hi = 10 ** c.hi;
  const kept = all.filter((v) => v >= lo && v <= hi);
  const logs = (v: number[]) => v.map((x) => Math.log10(x));
  const before = hist(logs(all), LOG_LO, LOG_HI, LOG_BINS);
  const after = hist(logs(kept), LOG_LO, LOG_HI, LOG_BINS);
  const top = niceTop(Math.max(...before, 1));
  const f = frame([LOG_LO, LOG_HI], [0, top]);
  const p = axes(f);
  p.xTicks = [-6, -4, -2, 0, 2, 4].map((v) => ({ x: f.x(v), y1: f.b.t, y2: f.b.b, ty: f.b.b + 16, label: pow10Label(v) }));
  p.bars = histBars(f, before, LOG_LO, LOG_HI, MUT, 0.35).concat(histBars(f, after, LOG_LO, LOG_HI, AC));
  p.lines = [c.lo, c.hi].map((v) => ln(f.path([[v, 0], [v, top]]), { stroke: INK, dash: '6 4', width: 1.5 }));
  p.xLabel = 'Asking price (billion toman, each step is ten times larger)';
  p.yLabel = 'Listings';
  p.legend = ['Dark bars: kept', 'Pale bars: before cleaning', 'Dashed: your bounds'];
  return p;
};

function fitView(ctx: LabCtx, c: Cur, errors: boolean): PlotSpec {
  const xd = ctx.dom.area;
  const f = frame(xd, ctx.dom.price);
  const p = axes(f);
  const yat = (a: number) => (c.w * a) / 100 + c.b;
  if (errors) {
    p.lines = ctx.panel.map((i) => {
      const r = ctx.d.rows[i];
      return ln(f.path([[r.area, r.price], [r.area, yat(r.area)]]), { stroke: MUT, width: 1 });
    });
  }
  p.lines.push(ln(f.line(xd[0], yat(xd[0]), xd[1], yat(xd[1]))));
  p.points = ctx.d.rows.map((r) => pt(f, r.area, r.price, { r: 3.5, op: 0.6 }));
  p.xLabel = 'Area (m²)';
  p.yLabel = TARGET;
  const out = ctx.d.rows.filter((r) => r.area > xd[1] || r.price > ctx.dom.price[1]).length;
  p.legend = errors
    ? ['Line: the current model', `Thin lines: the error for every ${Math.ceil(ctx.d.n / ctx.panel.length)}th listing`]
    : ['Line: the current model', 'Dots: listings'];
  const note = beyondNote(out);
  if (note) p.legend.push(note);
  return p;
}
export const fitPlot: ViewFn = (ctx, c) => fitView(ctx, c, false);
export const errorsPlot: ViewFn = (ctx, c) => fitView(ctx, c, true);

export const costCurve: ViewFn = (ctx, c) => {
  const { w: wd } = wbDomains(ctx);
  const ws = range(81, (i) => wd[0] + ((wd[1] - wd[0]) * i) / 80);
  const js = ws.map((w) => cost1(ctx, w, c.b));
  const f = frame(wd, [0, niceTop(Math.max(...js, 1))]);
  const p = axes(f);
  p.lines = [ln(f.path(ws.map((w, i) => [w, js[i]])))];
  p.points = [pt(f, c.w, cost1(ctx, c.w, c.b), { r: 7, fill: AC, op: 1 })];
  p.xLabel = 'w';
  p.yLabel = 'Cost J';
  p.legend = ['Curve: J(w) with b fixed at its current value', 'Marker: current w'];
  return p;
};

export const contour: ViewFn = (ctx, c) => {
  const d = wbDomains(ctx);
  const f = frame(d.w, d.b);
  const p = axes(f);
  p.lines = rings(ctx, f);
  p.lines.push(ln(f.path(c.hist1.map((q) => [q.w, q.b] as [number, number]))));
  p.points = [pt(f, c.w, c.b, { r: 7, fill: AC, op: 1 })];
  p.xLabel = 'w';
  p.yLabel = 'b';
  p.legend =
    c.hist1.length > 1
      ? ['Rings: equal cost', 'Line: the path of gradient descent']
      : ['Rings: equal cost', 'Marker: current w and b'];
  return p;
};

export const surface: ViewFn = (ctx, c) => {
  const p = emptyPlot();
  const { w: wd, b: bd } = wbDomains(ctx);
  const cw = (wd[0] + wd[1]) / 2;
  const cb = (bd[0] + bd[1]) / 2;
  const hw = (wd[1] - wd[0]) / 2;
  const hb = (bd[1] - bd[0]) / 2;
  const N = 16;
  const excess = (w: number, b: number) => cost1(ctx, w, b) - ctx.jStar;
  const zmax = excess(cw + hw, cb) || 1;
  const proj = (u: number, v: number, z: number): [number, number] => [
    360 + (u - v) * 190,
    285 + (u + v) * 52 - Math.min(z, 1) * 160,
  ];
  const at = (i: number, k: number) => {
    const u = (i / N) * 2 - 1;
    const v = (k / N) * 2 - 1;
    return proj(u, v, excess(cw + u * hw, cb + v * hb) / zmax);
  };
  const dp = (pts: Array<[number, number]>) =>
    pts.map((q, i) => `${i ? 'L' : 'M'}${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(' ');
  for (let i = 0; i <= N; i += 2) {
    p.lines.push(ln(dp(range(N + 1, (k) => at(i, k))), { stroke: MUT, width: 1 }));
    p.lines.push(ln(dp(range(N + 1, (k) => at(k, i))), { stroke: MUT, width: 1 }));
  }
  const place = (q: { w: number; b: number }) => {
    const u = Math.max(-1, Math.min(1, (q.w - cw) / hw));
    const v = Math.max(-1, Math.min(1, (q.b - cb) / hb));
    return proj(u, v, excess(cw + u * hw, cb + v * hb) / zmax);
  };
  if (c.hist1.length > 1) p.lines.push(ln(dp(c.hist1.map(place))));
  const m = place(c);
  p.points = [{ cx: m[0], cy: m[1], r: 7, fill: AC, stroke: 'none', op: 1 }];
  p.legend = ['Height is cost J. The bowl has one lowest point.', 'Marker: current w and b. Heights above the frame are cut off.'];
  return p;
};

export const tangent: ViewFn = (ctx, c) => {
  const { w: wd } = wbDomains(ctx);
  const ws = range(81, (i) => wd[0] + ((wd[1] - wd[0]) * i) / 80);
  const js = ws.map((w) => cost1(ctx, w, c.b));
  const f = frame(wd, [0, niceTop(Math.max(...js, 1))]);
  const p = axes(f);
  const g = grad1(ctx, c.w, c.b);
  const j = cost1(ctx, c.w, c.b);
  const h = (wd[1] - wd[0]) * 0.12;
  p.lines = [
    ln(f.path(ws.map((w, i) => [w, js[i]])), { stroke: MUT, width: 2 }),
    ln(f.line(c.w - h, j - h * g[0], c.w + h, j + h * g[0]), { width: 3 }),
  ];
  p.points = [pt(f, c.w, j, { r: 7, fill: AC, op: 1 })];
  p.xLabel = 'w';
  p.yLabel = 'Cost J';
  p.legend = [
    'Accent line: the slope ∂J/∂w at the current w',
    'Positive slope: w must go down. Negative slope: w must go up.',
  ];
  return p;
};

export const arrows: ViewFn = (ctx, c) => {
  const d = wbDomains(ctx);
  const f = frame(d.w, d.b);
  const p = axes(f);
  p.lines = rings(ctx, f);
  // Pixels per unit on each axis. Arrows follow the gradient as drawn, so they cross the rings at right angles.
  const sx = (f.b.r - f.b.l) / (d.w[1] - d.w[0]);
  const sy = (f.b.b - f.b.t) / (d.b[1] - d.b[0]);
  for (let i = 0; i <= 8; i++) {
    for (let k = 0; k <= 6; k++) {
      const w = d.w[0] + ((d.w[1] - d.w[0]) * (i + 0.5)) / 9;
      const b = d.b[0] + ((d.b[1] - d.b[0]) * (k + 0.5)) / 7;
      const g = grad1(ctx, w, b);
      const dx = g[0] / sx;
      const dy = g[1] / sy;
      const mag = Math.hypot(dx, dy) || 1;
      const len = 24;
      p.lines.push(ln(f.line(w, b, w + ((dx / mag) * len) / sx, b + ((dy / mag) * len) / sy), { stroke: INK, width: 1.5 }));
      p.points.push(pt(f, w, b, { r: 2, fill: INK, op: 1 }));
    }
  }
  p.points.push(pt(f, c.w, c.b, { r: 7, fill: AC, op: 1 }));
  p.xLabel = 'w';
  p.yLabel = 'b';
  p.legend = ['Each stroke starts at the dot and points uphill', 'They all point away from the lowest cost'];
  return p;
};

export const gdCost: ViewFn = (ctx, c) => {
  const top = niceTop(Math.max((c.hist1[0]?.j ?? ctx.jZero) * 1.05, 1));
  const f = frame([0, c.iters], [0, top]);
  const p = axes(f);
  p.lines = [ln(f.path(c.hist1.map((q, i) => [i, q.j] as [number, number])))];
  p.points = [pt(f, c.it, c.j, { r: 6, fill: AC, op: 1 })];
  p.xLabel = 'Iteration';
  p.yLabel = 'Cost J';
  p.legend = ['Should fall on every iteration. Rising means α is too large.'];
  return p;
};

export const gdParams: ViewFn = (ctx, c) => {
  const vals = c.hist1.flatMap((q) => [q.w, q.b]).concat([ctx.bp, ctx.wp, 0]);
  const [lo, hi] = niceSpan(Math.max(-100, Math.min(...vals)), Math.min(100, Math.max(...vals)));
  const f = frame([0, c.iters], [lo, hi]);
  const p = axes(f);
  p.lines = [
    ln(f.path(c.hist1.map((q, i) => [i, q.w] as [number, number]))),
    ln(f.path(c.hist1.map((q, i) => [i, q.b] as [number, number])), { stroke: INK, dash: '6 4' }),
  ];
  p.xLabel = 'Iteration';
  p.yLabel = 'Parameter value';
  p.legend = ['Solid: w', 'Dashed: b'];
  return p;
};
