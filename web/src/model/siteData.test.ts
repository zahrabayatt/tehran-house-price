import { describe, expect, it } from 'vitest';
import hexes from '../../public/data/hexes.json';
import neighborhoods from '../../public/data/neighborhoods.json';
import listings from '../../public/data/listings.json';
import modelJson from '../../../model/model.json';
import {
  gapSentence, hexCenter, hexOpacities, listingPage, modelCell, monthLabel,
  resolveNeighborhood, signed, slugTitle, type SiteModel,
} from './siteData';

const model = modelJson as unknown as SiteModel;

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

describe('hexCenter', () => {
  it('is the mean of the six corners', () => {
    const c = hexCenter('M450.0 258.0 L443.9 261.5 L437.9 258.0 L437.9 251.0 L443.9 247.5 L450.0 251.0 Z');
    expect(c.x).toBeCloseTo(443.93, 2);
    expect(c.y).toBeCloseTo(254.5, 2);
  });
  it('works for every hexagon in the data', () => {
    for (const h of hexes) {
      const c = hexCenter(h.d);
      expect(Number.isFinite(c.x) && Number.isFinite(c.y)).toBe(true);
    }
  });
});

describe('resolveNeighborhood', () => {
  it('matches a label ignoring case and spaces at the ends', () => {
    expect(resolveNeighborhood('  saadat abad ', neighborhoods)?.id).toBe('saadat-abad');
  });
  it('returns null for blank text, partial text and unknown names', () => {
    expect(resolveNeighborhood('', neighborhoods)).toBeNull();
    expect(resolveNeighborhood('Saadat', neighborhoods)).toBeNull();
    expect(resolveNeighborhood('Nowhere Land', neighborhoods)).toBeNull();
  });
});

describe('formatting', () => {
  it('gives real signs and drops the sign on zero', () => {
    expect(signed(1.234)).toBe('+1.23');
    expect(signed(-0.456)).toBe('−0.46');
    expect(signed(-0.001)).toBe('0.00');
    expect(signed(0)).toBe('0.00');
  });
  it('shows a negative model value as Below 0', () => {
    expect(modelCell(-1.14)).toBe('Below 0');
    expect(modelCell(5.634)).toBe('5.63');
  });
  it('words the held-out gap from the model file', () => {
    expect(gapSentence(model.held_out_gap)).toBe(
      'On listings it never trained on, the model was typically off by about 1.1 billion toman (15.6% of the price).',
    );
  });
  it('titles a slug', () => {
    expect(slugTitle('shaharak-e-moslemin')).toBe('Shaharak E Moslemin');
  });
});

describe('listingPage', () => {
  it('returns 4 at a time without overlap and wraps around', () => {
    const a = listingPage(listings, 0);
    const b = listingPage(listings, 1);
    expect(a).toHaveLength(4);
    expect(b).toHaveLength(4);
    expect(a.some((x) => b.includes(x))).toBe(false);
    expect(listingPage(listings, listings.length / 4)).toEqual(a);
  });
  it('copes with an empty or short list', () => {
    expect(listingPage([], 3)).toEqual([]);
    expect(listingPage(listings.slice(0, 2), 5)).toHaveLength(2);
  });
});

describe('hexOpacities', () => {
  it('runs from 0.12 for the cheapest cell to 0.87 for the dearest', () => {
    const ops = hexOpacities(hexes);
    expect(Math.min(...ops)).toBeCloseTo(0.12, 5);
    expect(Math.max(...ops)).toBeCloseTo(0.87, 5);
    const dear = hexes.reduce((m, h, i) => (h.value > hexes[m].value ? i : m), 0);
    expect(ops[dear]).toBeCloseTo(0.87, 5);
  });
});

describe('data files agree with the model', () => {
  it('every neighborhood in the list has a price in the model', () => {
    for (const n of neighborhoods) expect(Object.hasOwn(model.location.lookup, n.id)).toBe(true);
  });
  it('row counts add up to the cleaned data set in the data card', () => {
    const r = model.rows;
    expect(r.train + r.selection + r.held_out).toBe(81603);
  });
});
