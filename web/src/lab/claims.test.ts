import { describe, expect, it } from 'vitest';
import { fitSubset, multiRun, oneRun, predictArea, subsetCost } from './context';
import { gradOf, jOf } from './engine';
import { CURVE_AREA } from './views/poly';
import { itersNum } from './state';
import { STAGES } from './stages';
import { ctx } from './testData';
import type { LabState, Try } from './types';

/**
 * Each Try this preset says what it shows. These tests run the preset's settings on the real sample
 * and check the sentence is true. If the data changes and a sentence stops being true, a test here
 * fails and the note has to be rewritten.
 */

const stage = (title: string) => {
  const s = STAGES.find((q) => q.title === title);
  if (!s) throw new Error(title);
  return s;
};
const preset = (title: string, label: string): Partial<LabState> => {
  const t: Try | undefined = stage(title).tries.find((q) => q.label === label);
  if (!t) throw new Error(`${title}: ${label}`);
  return typeof t.set === 'function' ? t.set(ctx) : t.set;
};
const alphaOf = (p: Partial<LabState>) => 10 ** (p.alphaExp as number);
const itersOf = (p: Partial<LabState>) => itersNum(p.iters as string);

describe('Cleaning presets', () => {
  const count = (p: Partial<LabState>) => {
    const lo = 10 ** (p.lo as number);
    const hi = 10 ** (p.hi as number);
    const keep = (v: number) => v >= lo && v <= hi;
    return { sample: ctx.d.y.filter(keep).length, dirty: ctx.dirty.filter(keep).length };
  };
  it('Keep everything keeps every ad', () => {
    expect(count(preset('Cleaning', 'Keep everything'))).toEqual({ sample: ctx.d.n, dirty: ctx.dirty.length });
  });
  it('Too strict removes many ordinary listings', () => {
    expect(count(preset('Cleaning', 'Too strict')).sample).toBeLessThan(ctx.d.n * 0.75);
  });
  it('the sensible bounds keep every ordinary listing, drop most impossible prices, and let a few through', () => {
    const c = count(preset('Cleaning', 'Bounds that keep the sample'));
    expect(c.sample).toBe(ctx.d.n);
    expect(c.dirty).toBeGreaterThan(0);
    expect(c.dirty).toBeLessThan(ctx.dirty.length / 2);
  });
});

describe('The model presets', () => {
  it('Flat line is flat, Too steep overshoots the listings, the plausible line follows the trend', () => {
    const flat = preset('The model', 'Flat line');
    expect(flat.w0).toBe(0);
    const steep = preset('The model', 'Too steep');
    const top = ctx.dom.price[1];
    expect((steep.w0 as number) * (ctx.dom.area[1] / 100) + (steep.b0 as number)).toBeGreaterThan(top);
    const ok = preset('The model', 'A plausible line');
    expect(jOf(ctx.d, ok.w0 as number, ok.b0 as number)).toBeLessThan(ctx.jStar * 1.15);
    expect(jOf(ctx.d, flat.w0 as number, flat.b0 as number)).toBeGreaterThan(ctx.jStar * 1.5);
  });
});

describe('Cost function presets', () => {
  it('Near the best line sits at the lowest cost and Far away costs far more', () => {
    const near = preset('Cost function', 'Near the best line');
    expect(jOf(ctx.d, near.w0 as number, near.b0 as number)).toBeCloseTo(ctx.jStar, 6);
    const far = preset('Cost function', 'Far away');
    expect(jOf(ctx.d, far.w0 as number, far.b0 as number)).toBeGreaterThan(ctx.jStar * 5);
  });
});

describe('Gradient presets', () => {
  const slope = (title: string) => {
    const p = preset('Gradient', title);
    return gradOf(ctx.d, p.w0 as number, p.b0 as number)[0];
  };
  it('are negative left of the minimum, positive right of it, and near zero at it', () => {
    expect(slope('Left of the minimum')).toBeLessThan(-1);
    expect(slope('Right of the minimum')).toBeGreaterThan(1);
    expect(Math.abs(slope('At the minimum'))).toBeLessThan(1e-6);
  });
});

describe('Gradient descent presets', () => {
  const run = (label: string) => {
    const p = preset('Gradient descent', label);
    return oneRun(ctx, p.w0 as number, p.b0 as number, alphaOf(p), itersOf(p));
  };
  it('a good rate falls on every step, quickly at first, then flattens', () => {
    const r = run('A good learning rate');
    expect(r.diverged).toBeNull();
    const j = r.h.map((q) => q.j);
    for (let i = 1; i < j.length; i++) expect(j[i]).toBeLessThanOrEqual(j[i - 1] + 1e-9);
    const drop = (a: number, b: number) => j[a] - j[b];
    expect(drop(0, 10)).toBeGreaterThan(drop(10, 20) * 1.5);
    expect(Math.abs(j[j.length - 1] - j[j.length - 21])).toBeLessThan(0.01 * j[j.length - 1]);
  });
  it('a very small rate is stable but the cost is still well above the minimum when the run ends', () => {
    const r = run('Very small α');
    expect(r.diverged).toBeNull();
    expect(r.h[r.h.length - 1].j).toBeGreaterThan(ctx.jStar * 2);
  });
  it('a too large rate flips the sign of the slope each step and diverges', () => {
    const r = run('α too large');
    expect(r.diverged).not.toBeNull();
    expect(r.diverged as number).toBeLessThan(40);
    const flips = r.h.slice(1, 8).filter((q, i) => Math.sign(q.gw) !== Math.sign(r.h[i].gw)).length;
    expect(flips).toBeGreaterThanOrEqual(5);
    expect(r.h[r.h.length - 1].j).toBeGreaterThan(r.h[0].j);
  });
});

describe('Multiple features presets', () => {
  const runOf = (label: string) => {
    const p = preset('Multiple features', label);
    return multiRun(ctx, false, alphaOf(p), itersOf(p));
  };
  it('Small α, long run: stable, area settles first, the other weights are still moving', () => {
    const r = runOf('Small α, long run');
    expect(r.diverged).toBeNull();
    const rel = (j: number) => {
      const a = r.h[r.h.length - 1].w[j];
      const b = r.h[r.h.length - 301].w[j];
      return Math.abs(a - b) / Math.max(Math.abs(a), 1e-12);
    };
    expect(rel(0)).toBeLessThan(0.02);
    expect(Math.max(rel(1), rel(2), rel(3))).toBeGreaterThan(0.1);
  });
  it('Just below the limit reaches a lower cost than the default in the same iterations', () => {
    const fast = runOf('Just below the limit');
    const base = multiRun(ctx, false, 10 ** -4.3, 500);
    expect(fast.diverged).toBeNull();
    expect(fast.h[fast.h.length - 1].j).toBeLessThan(base.h[base.h.length - 1].j);
  });
  it('Just past the limit diverges', () => {
    expect(runOf('Just past the limit').diverged).not.toBeNull();
  });
});

describe('Learning rate presets', () => {
  it('the largest rate diverges and the one just below it zig-zags while the cost still falls', () => {
    const p = preset('Learning rate', 'Race four values');
    const [, , third, fourth] = p.lrs as number[];
    const big = multiRun(ctx, false, fourth, itersOf(p));
    expect(big.diverged).not.toBeNull();
    const zig = multiRun(ctx, false, third, itersOf(p));
    expect(zig.diverged).toBeNull();
    const w0 = zig.h.slice(0, 31).map((q) => q.w[0]);
    let flips = 0;
    for (let i = 2; i < w0.length; i++) if ((w0[i] - w0[i - 1]) * (w0[i - 1] - w0[i - 2]) < 0) flips++;
    expect(flips).toBeGreaterThanOrEqual(5);
    expect(zig.h[zig.h.length - 1].j).toBeLessThan(zig.h[0].j);
  });
});

describe('Feature scaling presets', () => {
  it('Large α: scaled features converge and raw ones diverge', () => {
    const p = preset('Feature scaling', 'Large α with scaling');
    const sc = multiRun(ctx, true, alphaOf(p), itersOf(p));
    const raw = multiRun(ctx, false, alphaOf(p), itersOf(p));
    expect(sc.diverged).toBeNull();
    const best = multiRun(ctx, true, 0.3, 2000).h.slice(-1)[0].j;
    expect(sc.h[sc.h.length - 1].j).toBeLessThan(best * 1.02);
    expect(raw.diverged).not.toBeNull();
  });
  it('Tiny α: both survive and neither is close to finished', () => {
    const p = preset('Feature scaling', 'Tiny α for both');
    const sc = multiRun(ctx, true, alphaOf(p), itersOf(p));
    const raw = multiRun(ctx, false, alphaOf(p), itersOf(p));
    const best = multiRun(ctx, true, 0.3, 2000).h.slice(-1)[0].j;
    expect(sc.diverged).toBeNull();
    expect(raw.diverged).toBeNull();
    expect(sc.h[sc.h.length - 1].j).toBeGreaterThan(best * 1.2);
    expect(raw.h[raw.h.length - 1].j).toBeGreaterThan(best * 1.2);
  });
});

describe('Overfitting presets', () => {
  const cost = (d: number) => subsetCost(ctx, fitSubset(ctx, d, 0));
  const reach = (d: number) => {
    const fit = fitSubset(ctx, d, 0);
    let top = -Infinity;
    for (let a = CURVE_AREA[0]; a <= CURVE_AREA[1]; a += 2) top = Math.max(top, predictArea(ctx, fit, a));
    return top;
  };
  it('degree 1 has the highest training cost of the three, degree 9 the lowest', () => {
    expect(cost(1)).toBeGreaterThan(cost(3));
    expect(cost(3)).toBeGreaterThan(cost(9));
  });
  it('degree 9 swings far above the training prices; degree 1 does not', () => {
    const maxY = Math.max(...ctx.sub.y);
    expect(reach(9)).toBeGreaterThan(maxY * 2);
    expect(reach(1)).toBeLessThan(maxY * 1.5);
  });
});

describe('Regularization presets', () => {
  const at = (label: string) => {
    const p = preset('Regularization', label);
    return fitSubset(ctx, p.degree as number, 10 ** (p.lamExp as number));
  };
  const biggest = (label: string) => Math.max(...at(label).theta.slice(1).map(Math.abs));
  it('weights shrink as lambda rises, and too much underfits', () => {
    expect(biggest('Almost no penalty')).toBeGreaterThan(biggest('A moderate λ'));
    expect(biggest('A moderate λ')).toBeGreaterThan(biggest('Too much'));
    expect(biggest('Too much')).toBeLessThan(0.5);
    expect(subsetCost(ctx, at('Too much'))).toBeGreaterThan(subsetCost(ctx, fitSubset(ctx, 1, 0)));
  });
  it('a moderate lambda gives a smoother curve than almost none', () => {
    const swing = (label: string) => {
      const fit = at(label);
      let s = 0;
      let prev = predictArea(ctx, fit, CURVE_AREA[0]);
      let prev2 = prev;
      for (let a = CURVE_AREA[0] + 2; a <= CURVE_AREA[1]; a += 2) {
        const v = predictArea(ctx, fit, a);
        s += Math.abs(v - 2 * prev + prev2);
        prev2 = prev;
        prev = v;
      }
      return s;
    };
    expect(swing('A moderate λ')).toBeLessThan(swing('Almost no penalty'));
  });
});

describe('Held-out presets', () => {
  it('set the sandbox split and open the sandbox view', () => {
    const a = preset('Held-out result', 'Less training data');
    const b = preset('Held-out result', 'More training data');
    expect(a).toMatchObject({ split: 50, view: 2 });
    expect(b).toMatchObject({ split: 90, view: 2 });
    expect(Math.floor((ctx.d.n * 50) / 100)).toBe(250);
    expect(ctx.d.n - Math.floor((ctx.d.n * 90) / 100)).toBe(50);
  });
});
