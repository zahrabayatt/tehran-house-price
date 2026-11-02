import type { Model } from './types';

const isNumberArray = (v: unknown, n: number): v is number[] =>
  Array.isArray(v) && v.length === n && v.every(Number.isFinite);

function bad(why: string): never {
  throw new Error(`Model file is malformed: ${why}`);
}

/** Check the parts of the file the predictor depends on. Throws a readable error. */
export function assertModel(data: unknown): asserts data is Model {
  const m = data as Partial<Model> | null;
  if (typeof m !== 'object' || m === null) bad('not an object');
  if (!Array.isArray(m.features) || m.features.length === 0
      || !m.features.every((f) => typeof f === 'string')) bad('features');
  const n = m.features.length;
  if (!isNumberArray(m.weights, n)) bad('weights');
  if (typeof m.bias !== 'number' || !Number.isFinite(m.bias)) bad('bias');
  if (!m.scaling || !isNumberArray(m.scaling.mu, n) || !isNumberArray(m.scaling.sigma, n)) {
    bad('scaling');
  }
  const loc = m.location;
  if (!loc || typeof loc.lookup !== 'object' || loc.lookup === null
      || !Object.values(loc.lookup).every(Number.isFinite)
      || typeof loc.fallback !== 'number' || !Number.isFinite(loc.fallback)) {
    bad('location');
  }
}

/** Fetch and check the model. Rejects on a failed request, bad JSON, or a malformed file. */
export async function loadModel(url: string): Promise<Model> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load the model (HTTP ${res.status}).`);
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    bad('not valid JSON');
  }
  assertModel(data);
  return data;
}
