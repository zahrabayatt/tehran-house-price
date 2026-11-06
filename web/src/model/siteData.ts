import { loadModel } from './loadModel';
import type { Model } from './types';

/** One official neighborhood (OpenStreetMap), with its 2024 ads (training/site_data.py). */
export interface HoodFeature {
  type: 'Feature';
  id: number;
  properties: {
    name: string;
    /** Ads inside the neighborhood, May to December 2024. */
    ads: number;
    /** Median asking price per m², million toman. Only with at least 15 ads. */
    ppm2?: number;
    /** The Divar neighborhood most of its ads name: what the model is given. */
    divar?: string;
  };
  geometry: { type: 'MultiPolygon'; coordinates: number[][][][] };
}
export interface HoodCollection {
  type: 'FeatureCollection';
  features: HoodFeature[];
}

/** Area (m²) and price (billion toman) of November and December ads, by neighborhood id. */
export type SimilarAds = Record<string, Array<[number, number]>>;

export interface Listing {
  neighborhood: string;
  area: number;
  rooms: number;
  age: number;
  /** Asking price, billions of toman. */
  asked: number;
  /** Raw model output, billions of toman. Can be below 0. */
  model: number;
  /** model minus asked. */
  difference: number;
}

/** The model file with the fields the pages need. */
export type SiteModel = Model & Required<Pick<Model, 'held_out_gap' | 'date_range' | 'rows'>>;

export interface EstimateData {
  model: SiteModel;
  hoods: HoodCollection;
  similar: SimilarAds;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** "2024-12" becomes "December 2024". Throws on anything else. */
export function monthLabel(ym: string): string {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(ym);
  if (!m) throw new Error(`Unexpected month "${ym}" in the model file.`);
  return `${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

/** Neighborhoods with a price, which are the ones that can be chosen, sorted by name. */
export function choosable(hoods: HoodCollection): HoodFeature[] {
  return hoods.features
    .filter((f) => f.properties.ppm2 !== undefined)
    .sort((a, b) => a.properties.name.localeCompare(b.properties.name, 'en'));
}

/** Find a neighborhood by what the user typed: trimmed, ignoring case. Null when nothing matches. */
export function resolveHood(text: string, list: HoodFeature[]): HoodFeature | null {
  const t = text.trim().toLowerCase();
  if (t === '') return null;
  return list.find((f) => f.properties.name.toLowerCase() === t) ?? null;
}

/** The price-per-m² limits between five equal-sized groups of neighborhoods, rounded. */
export function priceBands(list: HoodFeature[]): number[] {
  const v = list.map((f) => f.properties.ppm2 as number).sort((a, b) => a - b);
  return [0.2, 0.4, 0.6, 0.8].map((q) => v[Math.floor(v.length * q)]);
}

function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export interface SimilarRange {
  low: number;
  high: number;
  count: number;
  /** Plain words for which ads these are. */
  source: string;
}

/** At least this many ads before a range is shown. */
export const MIN_SIMILAR = 15;

/**
 * The middle half of the prices of similar ads from November and December 2024: first ads of a
 * similar size in the same neighborhood, then a wider size window there, then similar sizes across
 * the city. Only the range is shown, never a single ad.
 */
export function similarRange(similar: SimilarAds, hood: HoodFeature | null, area: number): SimilarRange | null {
  const tiers: Array<{ ads: Array<[number, number]>; window: number; where: string }> = [];
  if (hood) {
    const here = similar[String(hood.id)] ?? [];
    tiers.push({ ads: here, window: 15, where: `in ${hood.properties.name}` });
    tiers.push({ ads: here, window: 30, where: `in ${hood.properties.name}` });
  }
  tiers.push({ ads: Object.values(similar).flat(), window: 10, where: 'across Tehran' });
  for (const t of tiers) {
    const lo = Math.max(0, area - t.window);
    const hi = area + t.window;
    const prices = t.ads.filter(([a]) => a >= lo && a <= hi).map(([, p]) => p).sort((a, b) => a - b);
    if (prices.length >= MIN_SIMILAR) {
      return {
        low: quantile(prices, 0.25),
        high: quantile(prices, 0.75),
        count: prices.length,
        source: `The middle half of ${prices.length.toLocaleString('en-US')} ads for ${Math.round(lo)} to ${Math.round(hi)} m² ${t.where}, November and December 2024.`,
      };
    }
  }
  return null;
}

const MINUS = '−';

/** A signed number with a real sign and fixed decimals. Values that round to zero get no sign. */
export function signed(value: number, decimals = 2): string {
  const body = Math.abs(value).toFixed(decimals);
  if (Number(body) === 0) return body;
  return `${value < 0 ? MINUS : '+'}${body}`;
}

/**
 * A model value for a table of ads. Raw model output can be below 0, which is not a price,
 * and values from 0 up to 0.5 are below the cheapest apartment the model learned from.
 */
export function modelCell(value: number): string {
  if (value < 0) return 'Below 0';
  if (value < 0.5) return 'Below 0.5';
  return value.toFixed(2);
}

export async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url.split('/').pop()} (HTTP ${res.status}).`);
  try {
    return await res.json();
  } catch {
    throw new Error(`${url.split('/').pop()} is not valid JSON.`);
  }
}

/** Check the extra fields the pages read from the model file. */
export function assertSiteModel(m: Model): asserts m is SiteModel {
  const gap = m.held_out_gap;
  if (!gap || !Number.isFinite(gap.median_billions) || !Number.isFinite(gap.median_share_of_price)) {
    throw new Error('Model file is malformed: held_out_gap');
  }
  if (!m.date_range || typeof m.date_range.end !== 'string') {
    throw new Error('Model file is malformed: date_range');
  }
  const r = m.rows;
  if (!r || ![r.train, r.selection, r.held_out].every(Number.isFinite)) {
    throw new Error('Model file is malformed: rows');
  }
}

/** Load everything the Estimate page needs. Rejects with a readable message if any file fails. */
export async function loadEstimateData(base: string): Promise<EstimateData> {
  const url = (f: string) => `${base}data/${f}`;
  const [model, hoods, similar] = await Promise.all([
    loadModel(url('model.json')),
    getJson(url('neighborhoods.geojson')),
    getJson(url('similar.json')),
  ]);
  assertSiteModel(model);
  monthLabel(model.date_range.end);
  const h = hoods as HoodCollection;
  if (!h || !Array.isArray(h.features)) throw new Error('neighborhoods.geojson is malformed.');
  if (!similar || typeof similar !== 'object') throw new Error('similar.json is malformed.');
  return { model, hoods: h, similar: similar as SimilarAds };
}
