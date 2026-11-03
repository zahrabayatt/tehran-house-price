import { loadModel } from './loadModel';
import type { Model } from './types';

export interface Neighborhood {
  id: string;
  label: string;
  /** Median asking price per m2, in million toman. */
  median: number;
}

/** One map cell: an SVG path, its median price per m2 (million toman) and the neighborhood slug. */
export interface Hex {
  d: string;
  value: number;
  neighborhood: string;
}

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

/** The model file with the fields this page needs. */
export type SiteModel = Model & Required<Pick<Model, 'held_out_gap' | 'date_range' | 'rows'>>;

export interface SiteData {
  model: SiteModel;
  neighborhoods: Neighborhood[];
  hexes: Hex[];
  listings: Listing[];
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

/** Centre of a hexagon path such as "M450.0 258.0 L443.9 261.5 ... Z": the mean of its corners. */
export function hexCenter(d: string): { x: number; y: number } {
  const nums = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  const n = Math.floor(nums.length / 2);
  if (n === 0) throw new Error('Hexagon path has no points.');
  let x = 0;
  let y = 0;
  for (let i = 0; i < n; i++) {
    x += nums[2 * i];
    y += nums[2 * i + 1];
  }
  return { x: x / n, y: y / n };
}

/** Find a neighborhood by what the user typed: trimmed, ignoring case. Null when nothing matches. */
export function resolveNeighborhood(text: string, list: Neighborhood[]): Neighborhood | null {
  const t = text.trim().toLowerCase();
  if (t === '') return null;
  return list.find((n) => n.label.toLowerCase() === t) ?? null;
}

/** "ferdowsi" or "shaharak-e-moslemin" as a readable name, for slugs that have no label. */
export function slugTitle(slug: string): string {
  return slug.split('-').filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
}

const MINUS = '−';

/** A signed number with a real sign and fixed decimals. Values that round to zero get no sign. */
export function signed(value: number, decimals = 2): string {
  const body = Math.abs(value).toFixed(decimals);
  if (Number(body) === 0) return body;
  return `${value < 0 ? MINUS : '+'}${body}`;
}

/**
 * A model value for the listings table. Raw model output can be below 0, which is not a price,
 * and values from 0 up to 0.5 are below the cheapest apartment the model learned from.
 */
export function modelCell(value: number): string {
  if (value < 0) return 'Below 0';
  if (value < 0.5) return 'Below 0.5';
  return value.toFixed(2);
}

/** The plain-words sentence about the typical miss on listings the model never trained on. */
export function gapSentence(gap: SiteModel['held_out_gap']): string {
  const billions = gap.median_billions.toFixed(1);
  const share = (gap.median_share_of_price * 100).toFixed(1);
  return `On listings it never trained on, the model was typically off by about ${billions} billion toman (${share}% of the price).`;
}

/** Four listings starting at page * 4, wrapping around the list. */
export function listingPage(listings: Listing[], page: number, size = 4): Listing[] {
  if (listings.length === 0) return [];
  const out: Listing[] = [];
  for (let i = 0; i < Math.min(size, listings.length); i++) {
    out.push(listings[(page * size + i) % listings.length]);
  }
  return out;
}

/** Opacity for each hexagon from its rank by price, so a few very dear cells do not wash out the rest. */
export function hexOpacities(hexes: Hex[]): number[] {
  const order = hexes.map((h, i) => ({ v: h.value, i })).sort((a, b) => a.v - b.v);
  const out = new Array<number>(hexes.length).fill(0.12);
  const last = Math.max(1, order.length - 1);
  order.forEach((o, rank) => {
    out[o.i] = 0.12 + (rank / last) * 0.75;
  });
  return out;
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url.split('/').pop()} (HTTP ${res.status}).`);
  try {
    return await res.json();
  } catch {
    throw new Error(`${url.split('/').pop()} is not valid JSON.`);
  }
}

function list<T>(data: unknown, name: string): T[] {
  if (!Array.isArray(data)) throw new Error(`${name} is malformed: expected a list.`);
  return data as T[];
}

/** Check the extra fields this page reads from the model file. */
function assertSiteModel(m: Model): asserts m is SiteModel {
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
export async function loadSiteData(base: string): Promise<SiteData> {
  const url = (f: string) => `${base}data/${f}`;
  const [model, neighborhoods, hexes, listings] = await Promise.all([
    loadModel(url('model.json')),
    getJson(url('neighborhoods.json')),
    getJson(url('hexes.json')),
    getJson(url('listings.json')),
  ]);
  assertSiteModel(model);
  monthLabel(model.date_range.end);
  return {
    model,
    neighborhoods: list<Neighborhood>(neighborhoods, 'neighborhoods.json'),
    hexes: list<Hex>(hexes, 'hexes.json'),
    listings: list<Listing>(listings, 'listings.json'),
  };
}
