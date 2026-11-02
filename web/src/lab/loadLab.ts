import { loadModel } from '../model/loadModel';
import type { Listing } from '../model/siteData';
import type { LabInputs } from './context';
import type { Sample } from './engine';

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url.split('/').pop()} (HTTP ${res.status}).`);
  try {
    return await res.json();
  } catch {
    throw new Error(`${url.split('/').pop()} is not valid JSON.`);
  }
}

/** Check the sample the Lab trains on. Throws a readable error. */
export function assertSample(data: unknown): asserts data is Sample {
  const s = data as Partial<Sample> | null;
  if (!s || !Array.isArray(s.rows) || s.rows.length < 20) throw new Error('sample.json is malformed: rows.');
  const ok = s.rows.every(
    (r) => ['area', 'rooms', 'age', 'parking', 'price'].every((k) => Number.isFinite((r as unknown as Record<string, number>)[k])),
  );
  if (!ok) throw new Error('sample.json is malformed: a row has a missing or non-numeric field.');
  if (s.dirty_prices !== undefined && !(Array.isArray(s.dirty_prices) && s.dirty_prices.every(Number.isFinite))) {
    throw new Error('sample.json is malformed: dirty_prices.');
  }
}

/** Fetch everything the Lab needs: the sample, the real listings and the trained model. */
export async function loadLab(base: string): Promise<LabInputs> {
  const url = (f: string) => `${base}data/${f}`;
  const [model, sample, listings] = await Promise.all([
    loadModel(url('model.json')),
    getJson(url('sample.json')),
    getJson(url('listings.json')),
  ]);
  assertSample(sample);
  if (!Array.isArray(listings)) throw new Error('listings.json is malformed: expected a list.');
  return { model, sample, listings: listings as Listing[] };
}
