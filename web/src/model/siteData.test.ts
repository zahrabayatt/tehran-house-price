import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import modelJson from '../../../model/model.json';
import {
  choosable, modelCell, monthLabel, priceBands, resolveHood, signed, similarRange,
  type HoodCollection, type HoodFeature, type SiteModel, type SimilarAds,
} from './siteData';

const model = modelJson as unknown as SiteModel;
const read = (f: string) => JSON.parse(readFileSync(resolve(__dirname, '../../public/data', f), 'utf8'));
const hoods = read('neighborhoods.geojson') as HoodCollection;
const similar = read('similar.json') as SimilarAds;
const list = choosable(hoods);

describe('monthLabel', () => {
  it('names the month from the model file', () => {
    expect(monthLabel(model.date_range.end)).toBe('December 2024');
    expect(monthLabel('2025-02')).toBe('February 2025');
  });
  it('rejects anything that is not YYYY-MM', () => {
    expect(() => monthLabel('2024-13')).toThrow();
    expect(() => monthLabel('Dec 2024')).toThrow();
  });
});

describe('neighborhoods', () => {
  it('offers only neighborhoods with a price, sorted by name', () => {
    expect(list.length).toBeGreaterThan(300);
    expect(list.every((f) => f.properties.ppm2 !== undefined)).toBe(true);
    const names = list.map((f) => f.properties.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'en')));
  });
  it('finds a name ignoring case and spaces at the ends, and nothing for partial text', () => {
    expect(resolveHood('  saadat abad ', list)?.properties.divar).toBe('saadat-abad');
    expect(resolveHood('', list)).toBeNull();
    expect(resolveHood('Saadat', list)).toBeNull();
  });
  it('splits the city into five price bands of about equal size', () => {
    const bands = priceBands(list);
    expect(bands).toHaveLength(4);
    expect(bands).toEqual([...bands].sort((a, b) => a - b));
    const under = list.filter((f) => (f.properties.ppm2 as number) < bands[0]).length;
    expect(Math.abs(under - list.length / 5)).toBeLessThan(list.length / 10);
  });
});

describe('similarRange', () => {
  const box: HoodFeature = { type: 'Feature', id: 1, properties: { name: 'Box', ads: 40, ppm2: 100 }, geometry: { type: 'MultiPolygon', coordinates: [] } };
  it('is the middle half of similar-sized ads in the neighborhood', () => {
    const ads: SimilarAds = { '1': Array.from({ length: 20 }, (_, i) => [100, i + 1] as [number, number]) };
    const r = similarRange(ads, box, 100)!;
    expect(r.count).toBe(20);
    expect(r.low).toBeCloseTo(5.75);
    expect(r.high).toBeCloseTo(15.25);
    expect(r.source).toContain('85 to 115 m² in Box');
  });
  it('widens the size window, then falls back to the city, when there are too few ads', () => {
    const near: SimilarAds = { '1': Array.from({ length: 16 }, () => [125, 9] as [number, number]) };
    expect(similarRange(near, box, 100)?.source).toContain('70 to 130 m² in Box');
    const city: SimilarAds = { '1': [[100, 5]], '2': Array.from({ length: 30 }, () => [101, 8] as [number, number]) };
    expect(similarRange(city, box, 100)?.source).toContain('across Tehran');
    expect(similarRange({}, box, 100)).toBeNull();
  });
  it('gives Saadat Abad a range on the real data', () => {
    const r = similarRange(similar, resolveHood('Saadat Abad', list), 85)!;
    expect(r.count).toBeGreaterThanOrEqual(15);
    expect(r.low).toBeLessThan(r.high);
  });
});

describe('formatting', () => {
  it('gives real signs and drops the sign on zero', () => {
    expect(signed(1.234)).toBe('+1.23');
    expect(signed(-0.456)).toBe('−0.46');
    expect(signed(-0.001)).toBe('0.00');
  });
  it('shows a model value below the cheapest ad as text', () => {
    expect(modelCell(-1.14)).toBe('Below 0');
    expect(modelCell(5.634)).toBe('5.63');
    expect(modelCell(0.3)).toBe('Below 0.5');
  });
});
