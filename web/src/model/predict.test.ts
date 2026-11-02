import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadModel } from './loadModel';
import { predict, validateInput } from './predict';
import fixtures from './fixtures.json';
import modelJson from '../../../model/model.json';
import type { ApartmentInput, Model } from './types';

// The repository's trained model, not the synced copy, so a clean checkout can run the tests.
const model = modelJson as unknown as Model;

const base: ApartmentInput = {
  area: 100, neighborhood: 'elahiyeh', rooms: 2, year: 1395,
  parking: 1, elevator: 1, storage: 0,
};
const group = (name: string) => name.split('^')[0] === 'area' || name.split('^')[0] === 'location';

describe('parity with Python', () => {
  it('fixtures were made from this model', () => {
    expect(fixtures.modelBias).toBe(model.bias);
    expect(fixtures.features).toEqual(model.features);
  });

  it('has at least 20 cases including unknown neighborhoods', () => {
    expect(fixtures.cases.length).toBeGreaterThanOrEqual(20);
    const unknown = fixtures.cases.filter(
      (c) => c.input.neighborhood === null
        || !Object.hasOwn(model.location.lookup, c.input.neighborhood),
    );
    expect(unknown.length).toBeGreaterThanOrEqual(3);
  });

  it.each(fixtures.cases.map((c, i) => [i, c] as const))(
    'case %i matches Python within 1e-6 relative',
    (_i, c) => {
      const est = predict(model, c.input as ApartmentInput);
      expect(Math.abs(est.total - c.expected)).toBeLessThanOrEqual(
        1e-6 * Math.max(1, Math.abs(c.expected)),
      );
      // Grouped contributions equal the sum of the Python per-feature parts.
      const fc = c.featureContributions as Record<string, number>;
      const sizeExpected = Object.entries(fc)
        .filter(([k]) => group(k)).reduce((s, [, v]) => s + v, 0);
      const size = est.contributions.find((r) => r.label === 'Size and neighborhood')!;
      expect(size.value).toBeCloseTo(sizeExpected, 9);
    },
  );
});

describe('contributions', () => {
  it('baseline plus contributions equals total, and labels are as ruled', () => {
    for (const c of fixtures.cases) {
      const est = predict(model, c.input as ApartmentInput);
      const sum = est.contributions.reduce((s, r) => s + r.value, est.baseline);
      expect(Math.abs(sum - est.total)).toBeLessThan(1e-9);
      expect(est.baseline).toBe(model.bias);
    }
    const labels = predict(model, base).contributions.map((r) => r.label);
    expect(labels).toEqual([
      'Size and neighborhood', 'Bedrooms', 'Building age', 'Parking', 'Elevator', 'Storage',
    ]);
  });
});

describe('fallback neighborhood', () => {
  it('uses the Tehran-wide median for unknown, blank and null names', () => {
    const viaNull = predict(model, { ...base, neighborhood: null });
    const unknown = predict(model, { ...base, neighborhood: 'nowhere-land' });
    expect(viaNull.usedFallback).toBe(true);
    expect(unknown.usedFallback).toBe(true);
    expect(unknown.total).toBe(viaNull.total);
  });

  it('does not treat inherited object keys as neighborhoods', () => {
    expect(predict(model, { ...base, neighborhood: 'constructor' }).usedFallback).toBe(true);
    expect(predict(model, { ...base, neighborhood: '__proto__' }).usedFallback).toBe(true);
  });

  it('a known neighborhood does not use the fallback', () => {
    expect(predict(model, base).usedFallback).toBe(false);
  });
});

describe('tooSmall', () => {
  it('flags totals under 0.5 billion and keeps the raw total', () => {
    // Smallest, oldest apartment in a cheap neighborhood: the linear model goes negative.
    const tiny = predict(model, {
      area: 25, neighborhood: 'sharifabad', rooms: 1, year: 1370,
      parking: 1, elevator: 1, storage: 0,
    });
    expect(tiny.total).toBeLessThan(0.5);
    expect(tiny.total).toBeLessThan(0);
    expect(tiny.tooSmall).toBe(true);
    expect(predict(model, base).tooSmall).toBe(false);
  });
});

describe('validateInput', () => {
  const ok = { area: 80, neighborhood: 'elahiyeh', rooms: 2, year: 1395, parking: 1 };

  it('passes a clean input with no warnings', () => {
    const v = validateInput(ok);
    expect(v.warnings).toEqual([]);
    expect(v.input.year).toBe(1395);
  });

  it('blank year warns and uses 1395', () => {
    for (const year of ['', '  ', null, undefined, 'abc', NaN]) {
      const v = validateInput({ ...ok, year });
      expect(v.input.year).toBe(1395);
      expect(v.warnings.some((w) => w.code === 'year')).toBe(true);
      expect(Number.isFinite(predict(model, v.input).total)).toBe(true);
    }
  });

  it('out-of-range year warns and is clamped', () => {
    const low = validateInput({ ...ok, year: 1200 });
    const high = validateInput({ ...ok, year: '1450' });
    expect(low.input.year).toBe(1370);
    expect(high.input.year).toBe(1403);
    for (const v of [low, high]) {
      expect(v.warnings.some((w) => w.code === 'year')).toBe(true);
      expect(Number.isFinite(predict(model, v.input).total)).toBe(true);
    }
  });

  it('year bounds themselves are fine', () => {
    expect(validateInput({ ...ok, year: 1370 }).warnings).toEqual([]);
    expect(validateInput({ ...ok, year: 1403 }).warnings).toEqual([]);
  });

  it('clamps non-finite and out-of-range area into 25..600', () => {
    expect(validateInput({ ...ok, area: Infinity }).input.area).toBe(600);
    expect(validateInput({ ...ok, area: -Infinity }).input.area).toBe(25);
    expect(validateInput({ ...ok, area: 5 }).input.area).toBe(25);
    expect(validateInput({ ...ok, area: 9000 }).input.area).toBe(600);
    for (const area of [NaN, '', 'big', undefined]) {
      const v = validateInput({ ...ok, area });
      expect(Number.isFinite(v.input.area)).toBe(true);
      expect(v.input.area).toBeGreaterThanOrEqual(25);
      expect(v.input.area).toBeLessThanOrEqual(600);
    }
  });

  it('area above 200 gives a lowData warning, 200 does not', () => {
    expect(validateInput({ ...ok, area: 250 }).warnings.map((w) => w.code)).toContain('lowData');
    expect(validateInput({ ...ok, area: 200 }).warnings.map((w) => w.code)).not.toContain('lowData');
  });

  it('rooms are whole numbers from 0 to 5', () => {
    expect(validateInput({ ...ok, rooms: 9 }).input.rooms).toBe(5);
    expect(validateInput({ ...ok, rooms: -1 }).input.rooms).toBe(0);
    expect(validateInput({ ...ok, rooms: 2.4 }).input.rooms).toBe(2);
    expect(validateInput({ ...ok, rooms: '' }).warnings.some((w) => w.code === 'rooms')).toBe(true);
  });

  it('is always finite for hostile input', () => {
    const v = validateInput({
      area: NaN, rooms: Infinity, year: -Infinity, neighborhood: 42, parking: 'yes',
    });
    const { area, rooms, year } = v.input;
    expect([area, rooms, year].every(Number.isFinite)).toBe(true);
    expect(v.input.neighborhood).toBeNull();
    expect(Number.isFinite(predict(model, v.input).total)).toBe(true);
  });
});

describe('loadModel', () => {
  afterEach(() => vi.unstubAllGlobals());

  const stub = (res: Partial<Response>) =>
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res));

  it('resolves with a valid model', async () => {
    stub({ ok: true, status: 200, json: async () => model });
    await expect(loadModel('/data/model.json')).resolves.toMatchObject({ bias: model.bias });
  });

  it('rejects on a non-OK response', async () => {
    stub({ ok: false, status: 404 });
    await expect(loadModel('/x')).rejects.toThrow(/404/);
  });

  it('rejects on invalid JSON', async () => {
    stub({ ok: true, status: 200, json: async () => { throw new SyntaxError('bad'); } });
    await expect(loadModel('/x')).rejects.toThrow(/malformed/);
  });

  it('rejects on a malformed model', async () => {
    stub({ ok: true, status: 200, json: async () => ({ ...model, weights: [1, 2] }) });
    await expect(loadModel('/x')).rejects.toThrow(/weights/);
    stub({ ok: true, status: 200, json: async () => null });
    await expect(loadModel('/x')).rejects.toThrow(/malformed/);
  });

  it('rejects when the network fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    await expect(loadModel('/x')).rejects.toThrow();
  });
});
