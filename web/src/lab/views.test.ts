import { describe, expect, it } from 'vitest';
import type { PlotSpec } from '../components/Plot';
import { POLY_ITERS, fitFirst, fitSubset, multiRun, notConverged, polyAlpha } from './context';
import { clipSegment } from './plotkit';
import { INITIAL, computeCur, reducer } from './state';
import { STAGES } from './stages';
import { ctx } from './testData';
import type { Cur, LabState } from './types';

/** Every number a plot would hand to the SVG, as text, plus its labels. */
function strings(p: PlotSpec): string[] {
  return [
    ...p.points.flatMap((q) => [q.cx, q.cy, q.r, q.op]),
    ...p.bars.flatMap((q) => [q.x, q.y, q.w, q.h, q.op]),
    ...p.xTicks.flatMap((q) => [q.x, q.y1, q.y2, q.ty]),
    ...p.yTicks.flatMap((q) => [q.x1, q.x2, q.y, q.tx, q.ty]),
    ...p.texts.flatMap((q) => [q.x, q.y, q.size]),
  ].map(String);
}
const nonFinite = (p: PlotSpec) => [
  ...strings(p).filter((v) => !Number.isFinite(Number(v))),
  ...p.lines.map((l) => l.d).filter((d) => /NaN|Infinity|undefined/.test(d)),
  ...[...p.xTicks.map((t) => t.label), ...p.yTicks.map((t) => t.label), ...p.legend, p.xLabel, p.yLabel].filter((t) =>
    /NaN|Infinity|undefined/.test(t),
  ),
];
const area = (p: PlotSpec) => p.points.length + p.lines.filter((l) => l.d).length + p.bars.length + p.texts.length;

function at(stage: number, patch: Partial<LabState>, reduced = true): { s: LabState; c: Cur } {
  let s = reducer({ ...INITIAL }, { type: 'goto', stage, stages: STAGES });
  s = { ...s, ...patch };
  if (STAGES[stage].train) s = reducer(s, { type: 'start', reduced });
  return { s, c: computeCur(ctx, STAGES[stage], s) };
}

/** Settings that stress each control at its limits, applied to every step. */
const STRESS: Array<Partial<LabState>> = [
  {},
  { bins: 4, lo: -6, hi: 5, m: 10, nf: 1, row: 499, degree: 1, lamExp: -2, split: 50, w0: -10, b0: -50 },
  { bins: 28, lo: 1, hi: 1, m: 5000, nf: 12, row: 0, degree: 10, lamExp: 3, split: 90, w0: 60, b0: 40 },
  { alphaExp: 0.3, iters: '5000' },
  { alphaExp: -4, iters: '1' },
  { lrs: [], iters: '50' },
  { lrs: [1e-9, 5, 100], iters: '30' },
];

describe('every view of every step', () => {
  STAGES.forEach((stage, si) => {
    stage.views.forEach((view, vi) => {
      it(`step ${si + 1} "${view.label}" draws finite numbers under stress`, () => {
        STRESS.forEach((patch, k) => {
          for (const state of [{ ...patch, view: vi }, { ...patch, view: vi, it: 3 }]) {
            const { c } = at(si, state, true);
            const spec = view.fn(ctx, c);
            expect(nonFinite(spec), `settings #${k}`).toEqual([]);
            expect(area(spec), `settings #${k} draws something`).toBeGreaterThanOrEqual(stage.lrs && state.lrs?.length === 0 ? 0 : 1);
            const { c: before } = at(si, { ...state, started: false }, true);
            const idle = view.fn(ctx, { ...before, view: vi });
            expect(nonFinite(idle), `settings #${k} before a run`).toEqual([]);
          }
        });
      });
    });
  });
});

describe('divergence', () => {
  it('stops the run at the first state that is not finite and keeps every plot finite', () => {
    const si = 5;
    const { s, c } = at(si, { alphaExp: 0.3, iters: '300' });
    expect(c.run!.diverged).not.toBeNull();
    expect(c.hist1.length).toBe(c.run!.diverged);
    expect(c.hist1.every((q) => Number.isFinite(q.j) && Number.isFinite(q.w))).toBe(true);
    for (const v of STAGES[si].views) expect(nonFinite(v.fn(ctx, c)), v.label).toEqual([]);
    expect(s.it).toBe(300);
  });
});

describe('plot helpers', () => {
  it('cut a line where it leaves the frame', () => {
    expect(clipSegment(-5, 5, 15, 5, [0, 10], [0, 10])).toEqual([0, 5, 10, 5]);
    expect(clipSegment(-5, -5, -1, -1, [0, 10], [0, 10])).toBeNull();
    expect(clipSegment(0, 0, 10, 10, [0, 10], [0, 10])).toEqual([0, 0, 10, 10]);
    expect(clipSegment(Number.NaN, 0, 1, 1, [0, 10], [0, 10])).toBeNull();
  });
});

describe('polynomial fits', () => {
  const GRID: Array<[number, number]> = [];
  for (let d = 1; d <= 10; d++) for (let e = -2; e <= 3; e += 0.5) GRID.push([d, 10 ** e]);

  it('stay finite for every degree and every lambda on the slider', () => {
    for (const [d, lam] of GRID) {
      const fit = fitSubset(ctx, d, lam);
      expect(fit.diverged, `degree ${d}, lambda ${lam}`).toBeNull();
      expect(fit.theta.every(Number.isFinite)).toBe(true);
      expect(Number.isFinite(fit.cost)).toBe(true);
    }
  });

  it('are memoized per (degree, lambda, iterations)', () => {
    expect(fitSubset(ctx, 4, 2)).toBe(fitSubset(ctx, 4, 2));
    expect(fitSubset(ctx, 4, 2)).not.toBe(fitSubset(ctx, 4, 3));
    expect(fitSubset(ctx, 4, 2, 100)).not.toBe(fitSubset(ctx, 4, 2));
    expect(fitFirst(ctx, 375, 3, 0.01)).toBe(fitFirst(ctx, 375, 3, 0.01));
    expect(multiRun(ctx, false, 1e-5, 50)).toBe(multiRun(ctx, false, 1e-5, 50));
  });

  it('use at most 500 iterations for the sweeps', () => {
    expect(POLY_ITERS).toBe(500);
    expect(fitSubset(ctx, 9, 0.01).history.length).toBeLessThanOrEqual(500);
  });

  it('use a step size below the stability limit and say when descent has not settled', () => {
    for (const [d, lam] of GRID) expect(polyAlpha(d, lam, 16)).toBeLessThan(2 / (d + 1 + lam / 16) + 1e-12);
    expect(notConverged(fitSubset(ctx, 9, 0.01))).toBe(true);
    expect(notConverged(fitSubset(ctx, 1, 0))).toBe(false);
  });

  it('draw a legend line when a fit has not fully converged', () => {
    const i = STAGES.findIndex((s) => s.title === 'Overfitting');
    const { c } = at(i, { degree: 9, view: 1 });
    const legend = STAGES[i].views[1].fn(ctx, c).legend.join(' ');
    expect(legend).toMatch(/not fully converged/);
    const { c: easy } = at(i, { degree: 1, view: 1 });
    expect(STAGES[i].views[1].fn(ctx, easy).legend.join(' ')).not.toMatch(/not fully converged/);
  });
});
