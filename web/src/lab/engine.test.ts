import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  gradOf, hist, jOf, makeLabData, polyCost, polyFit, polyFitGD, predPoly,
  runMulti, runOne, zscore,
} from './engine';
import type { LabData, Sample } from './engine';
import fixtures from './fixtures.json';
import sampleJson from '../../public/data/sample.json';
import modelJson from '../../../model/model.json';

const sample = sampleJson as unknown as Sample;
const d = makeLabData(sample);

/** Within 1e-6 relative, with an absolute floor of 1e-6 for values near zero. */
function close(actual: number, expected: number, what: string) {
  const tol = 1e-6 * Math.max(1, Math.abs(expected));
  expect(Math.abs(actual - expected), `${what}: ${actual} vs ${expected}`).toBeLessThanOrEqual(tol);
}
function closeAll(actual: number[], expected: number[], what: string) {
  expect(actual.length, `${what} length`).toBe(expected.length);
  expected.forEach((e, i) => close(actual[i], e, `${what}[${i}]`));
}

afterEach(() => vi.restoreAllMocks());

describe('makeLabData', () => {
  it('builds rows, x = area / 100 and y = price', () => {
    expect(d.n).toBe(fixtures.rows);
    expect(d.rows.length).toBe(d.n);
    expect(d.x[0]).toBeCloseTo(sample.rows[0].area / 100, 12);
    expect(d.y[0]).toBe(sample.rows[0].price);
    expect(d.X[0]).toEqual([sample.rows[0].area, sample.rows[0].rooms, sample.rows[0].age, sample.rows[0].parking]);
  });

  it('z-scores area, rooms, age and parking like the Python code', () => {
    closeAll(d.mus, fixtures.zscore.mu, 'mu');
    closeAll(d.sds, fixtures.zscore.sigma, 'sigma');
    fixtures.zscore.first.forEach((row, i) => closeAll(d.Xz[i], row, `Xz[${i}]`));
    closeAll(d.zs, d.Xz.map((r) => r[0]), 'zs');
    for (let j = 0; j < 4; j++) {
      const col = d.Xz.map((r) => r[j]);
      close(col.reduce((s, v) => s + v, 0) / d.n, 0, `mean ${j}`);
      close(Math.sqrt(col.reduce((s, v) => s + v * v, 0) / d.n), 1, `sd ${j}`);
    }
  });
});

describe('zscore', () => {
  it('returns z-values with population mean and standard deviation', () => {
    const r = zscore([1, 2, 3, 4]);
    expect(r.mu).toBe(2.5);
    expect(r.sd).toBeCloseTo(Math.sqrt(1.25), 12);
    expect(r.z[0]).toBeCloseTo(-1.5 / Math.sqrt(1.25), 12);
  });

  it('gives a constant column sd = 1 so nothing divides by zero', () => {
    const r = zscore([7, 7, 7]);
    expect(r.sd).toBe(1);
    expect(r.z).toEqual([0, 0, 0]);
  });
});

describe('hist', () => {
  it('counts values into equal bins and ignores values outside [lo, hi)', () => {
    expect(hist([0, 0.5, 1.2, 1.9, 2.5, 3, -1, 4], 0, 4, 4)).toEqual([2, 2, 1, 1]);
  });
});

describe('jOf and gradOf', () => {
  it('match model.py at every fixture checkpoint', () => {
    for (const c of fixtures.runOne) {
      for (const p of c.checkpoints) {
        close(jOf(d, p.w as number, p.b), p.j, `${c.name} j k=${p.k}`);
        const [gw, gb] = gradOf(d, p.w as number, p.b);
        close(gw, p.gw as number, `${c.name} gw k=${p.k}`);
        close(gb, p.gb as number, `${c.name} gb k=${p.k}`);
      }
    }
  });
});

describe('runOne', () => {
  for (const c of fixtures.runOne) {
    it(`matches Python: ${c.name}`, () => {
      const r = runOne(d, c.w0, c.b0, c.alpha, c.iters);
      expect(r.diverged).toBe(c.divergedAt);
      const states = c.divergedAt ?? c.iters + 1;
      expect(r.h.length).toBe(states);
      close(r.h[0].j, c.j0, 'j0');
      // jHistory[k - 1] is the cost of state k.
      for (let k = 1; k < states; k++) close(r.h[k].j, c.jHistory[k - 1], `j[${k}]`);
      for (const p of c.checkpoints) {
        const h = r.h[p.k];
        close(h.w, p.w as number, `w k=${p.k}`);
        close(h.b, p.b, `b k=${p.k}`);
        close(h.gw as number, p.gw as number, `gw k=${p.k}`);
        close(h.gb as number, p.gb as number, `gb k=${p.k}`);
      }
    });
  }

  it('with iters = 0 returns just the starting point', () => {
    const r = runOne(d, 1, 2, 0.1, 0);
    expect(r.h.length).toBe(1);
    expect(r.h[0].w).toBe(1);
    expect(r.h[0].b).toBe(2);
    expect(r.diverged).toBeNull();
  });
});

describe('runMulti', () => {
  for (const c of fixtures.runMulti) {
    it(`matches Python: ${c.name}`, () => {
      const r = runMulti(c.scaled ? d.Xz : d.X, d.y, c.alpha, c.iters);
      expect(r.diverged).toBe(c.divergedAt);
      const states = c.divergedAt ?? c.iters + 1;
      expect(r.h.length).toBe(states);
      close(r.h[0].j, c.j0, 'j0');
      for (let k = 1; k < states; k++) close(r.h[k].j, c.jHistory[k - 1], `j[${k}]`);
      for (const p of c.checkpoints) {
        closeAll(r.h[p.k].w as number[], p.w as number[], `w k=${p.k}`);
        close(r.h[p.k].b, p.b, `b k=${p.k}`);
      }
      expect('gw' in r.h[0]).toBe(false);
    });
  }
});

describe('divergence', () => {
  it('stops at the first cost above 1e9 and keeps only finite history', () => {
    const r = runOne(d, 0, 0, 2.5, 500);
    expect(r.diverged).not.toBeNull();
    expect(r.h.length).toBe(r.diverged);
    for (const s of r.h) {
      for (const v of [s.w, s.b, s.j, s.gw, s.gb]) expect(Number.isFinite(v)).toBe(true);
      expect(s.j).toBeLessThanOrEqual(1e9);
    }
    // The next state would have been over the limit.
    const last = r.h[r.h.length - 1];
    const w = last.w - 2.5 * (last.gw as number);
    const b = last.b - 2.5 * (last.gb as number);
    expect(jOf(d, w, b)).toBeGreaterThan(1e9);
  });

  it('stops when the cost stops being finite (infinite or NaN alpha)', () => {
    for (const alpha of [Infinity, NaN]) {
      const one = runOne(d, 0, 0, alpha, 50);
      expect(one.diverged).toBe(1);
      expect(one.h.length).toBe(1);
      const multi = runMulti(d.Xz, d.y, alpha, 50);
      expect(multi.diverged).toBe(1);
      expect(multi.h.length).toBe(1);
      expect(multi.h.every((s) => Number.isFinite(s.j))).toBe(true);
    }
  });

  it('stops the polynomial fit too and keeps the last finite theta', () => {
    const f = polyFitGD(d.zs, d.y, 5, 0, 5, 200);
    expect(f.diverged).not.toBeNull();
    expect(f.history.length).toBeLessThan(200);
    expect(f.history.every((j) => Number.isFinite(j) && j <= 1e9)).toBe(true);
    expect(f.theta.every(Number.isFinite)).toBe(true);
    expect(Number.isFinite(f.cost)).toBe(true);
  });

  it('reports diverged = null when a run completes', () => {
    expect(runOne(d, 0, 0, 0.05, 20).diverged).toBeNull();
    expect(runMulti(d.Xz, d.y, 0.1, 20).diverged).toBeNull();
    expect(polyFitGD(d.zs, d.y, 3, 0, 0.1, 20).diverged).toBeNull();
  });
});

describe('polyFitGD', () => {
  for (const c of fixtures.polyFit) {
    it(`matches Python: ${c.name}`, () => {
      const f = polyFitGD(d.zs, d.y, c.degree, c.lambda, c.alpha, c.iters);
      expect(f.diverged).toBeNull();
      closeAll(f.mu, c.mu, 'mu');
      closeAll(f.sigma, c.sigma, 'sigma');
      closeAll(f.theta, c.theta, 'theta');
      closeAll(f.history, c.jHistory, 'history');
      close(f.cost, c.cost, 'cost');
      expect(f.ms).toBeGreaterThanOrEqual(0);
    });
  }

  it('predPoly and polyCost use the fitted basis, and polyFit is the same fit', () => {
    const c = fixtures.polyFit[1];
    const f = polyFit(d.zs, d.y, c.degree, c.lambda, c.alpha, c.iters);
    close(polyCost(f, d.zs, d.y), c.cost, 'polyCost');
    const z = d.zs[3];
    let expected = f.theta[0];
    for (let p = 1; p <= c.degree; p++) expected += f.theta[p] * ((z ** p - f.mu[p - 1]) / f.sigma[p - 1]);
    close(predPoly(f, z), expected, 'predPoly');
  });
});

describe('timing', () => {
  it('ms comes from performance.now()', () => {
    const now = vi.spyOn(performance, 'now');
    now.mockReturnValueOnce(100).mockReturnValueOnce(107.5);
    expect(runOne(d, 0, 0, 0.1, 3).ms).toBe(7.5);
    now.mockReturnValueOnce(10).mockReturnValueOnce(14);
    expect(runMulti(d.Xz, d.y, 0.1, 3).ms).toBe(4);
    now.mockReturnValueOnce(1).mockReturnValueOnce(3.25);
    expect(polyFitGD(d.zs, d.y, 2, 0, 0.1, 3).ms).toBe(2.25);
    expect(now).toHaveBeenCalledTimes(6);
  });
});

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object') {
    for (const v of Object.values(o as object)) deepFreeze(v);
    Object.freeze(o);
  }
  return o;
}

describe('sandbox isolation', () => {
  it('runs every engine function against frozen data without throwing or changing anything', () => {
    const model = deepFreeze(structuredClone(modelJson));
    const frozenSample = deepFreeze(structuredClone(sample)) as Sample;
    const before = JSON.stringify(model);
    const beforeSample = JSON.stringify(frozenSample);

    const lab: LabData = deepFreeze(makeLabData(frozenSample));
    const labBefore = JSON.stringify(lab);
    expect(() => {
      jOf(lab, 1, 1);
      gradOf(lab, 1, 1);
      runOne(lab, 0, 0, 0.1, 50);
      runOne(lab, 0, 0, 5, 50);
      runMulti(lab.X, lab.y, 1e-5, 50);
      runMulti(lab.Xz, lab.y, 0.1, 50);
      runMulti(lab.Xz, lab.y, 50, 50);
      zscore(lab.y);
      hist(lab.y, 0, 30, 10);
      const f = polyFitGD(lab.zs, lab.y, 4, 1, 0.1, 50);
      polyFitGD(lab.zs, lab.y, 4, 1, 50, 50);
      predPoly(f, 0.5);
      polyCost(f, lab.zs, lab.y);
      polyFit(lab.zs, lab.y, 2, 0, 0.1, 10);
    }).not.toThrow();

    expect(JSON.stringify(model)).toBe(before);
    expect(JSON.stringify(frozenSample)).toBe(beforeSample);
    expect(JSON.stringify(lab)).toBe(labBefore);
  });

  it('does not import the site model code', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'lab', 'engine.ts'), 'utf8');
    expect(src).not.toMatch(/^\s*import\s/m);
  });
});
