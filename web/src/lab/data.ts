/**
 * The Model Lab's data, fetched once and shared by every step.
 *
 * The files are written by training/site_data.py: every training ad (lab-train.json), every
 * stored ad before the cleaning limits (lab-clean.json), October's ads (lab-october.json) and
 * the live model's estimate for every held-out ad (lab-heldout.json). Each step asks for its
 * data by the name its design draft used, in the same shape, so the step code is unchanged.
 */

const BASE = import.meta.env.BASE_URL;

export interface TrainFile {
  rows: number;
  area: number[];
  rooms: number[];
  age: number[];
  parking: number[];
  location: number[];
  price: number[];
  fallback: number;
  hoods: number;
  examples: Array<{ hood: string; area: number; ppm2: number; loc: number; price: number }>;
}
interface CleanFile {
  area: number[];
  ppm2: number[];
}
interface OctoberFile {
  month: string;
  area: number[];
  price: number[];
}
interface HeldoutFile {
  months: string[];
  hoods: string[];
  estimate: number[];
  asked: number[];
  area: number[];
  rooms: number[];
  hood: number[];
  cost: Record<string, number>;
  sklearn: Record<string, number>;
  gap: Record<string, number>;
  rowCounts: Record<string, number>;
}

const cache = new Map<string, Promise<unknown>>();

function fetchJson<T>(file: string): Promise<T> {
  let p = cache.get(file) as Promise<T> | undefined;
  if (!p) {
    p = fetch(`${BASE}data/${file}`).then((r) => {
      if (!r.ok) throw new Error(`Could not load ${file} (${r.status}).`);
      return r.json() as Promise<T>;
    });
    cache.set(file, p);
    p.catch(() => cache.delete(file));
  }
  return p;
}

/** A seeded pick of k indexes from 0..n-1 (mulberry32), sorted, so a page shows the same ads every visit. */
export function seededPick(n: number, k: number, seed: number): number[] {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const chosen = new Set<number>();
  while (chosen.size < Math.min(k, n)) chosen.add(Math.floor(next() * n));
  return [...chosen].sort((a, b) => a - b);
}

/** Least squares with an intercept: the weights and b that give the lowest cost. */
export function leastSquares(columns: number[][], y: number[]): { w: number[]; b: number } {
  const k = columns.length + 1;
  const G = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const h = new Array<number>(k).fill(0);
  const row = new Array<number>(k);
  for (let i = 0; i < y.length; i++) {
    for (let j = 0; j < columns.length; j++) row[j] = columns[j][i];
    row[k - 1] = 1;
    for (let p = 0; p < k; p++) {
      h[p] += row[p] * y[i];
      for (let q = p; q < k; q++) G[p][q] += row[p] * row[q];
    }
  }
  for (let p = 0; p < k; p++) for (let q = 0; q < p; q++) G[p][q] = G[q][p];
  // Gaussian elimination with partial pivoting.
  for (let i = 0; i < k; i++) {
    let piv = i;
    for (let r = i + 1; r < k; r++) if (Math.abs(G[r][i]) > Math.abs(G[piv][i])) piv = r;
    [G[i], G[piv]] = [G[piv], G[i]];
    [h[i], h[piv]] = [h[piv], h[i]];
    for (let r = i + 1; r < k; r++) {
      const f = G[r][i] / G[i][i];
      for (let c = i; c < k; c++) G[r][c] -= f * G[i][c];
      h[r] -= f * h[i];
    }
  }
  const x = new Array<number>(k).fill(0);
  for (let i = k - 1; i >= 0; i--) {
    let s = h[i];
    for (let c = i + 1; c < k; c++) s -= G[i][c] * x[c];
    x[i] = s / G[i][i];
  }
  return { w: x.slice(0, k - 1), b: x[k - 1] };
}

const train = () => fetchJson<TrainFile>('lab-train.json');
const zip = (...cols: number[][]) => cols[0].map((_, i) => cols.map((c) => c[i]));
const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;

const SOURCES: Record<string, () => Promise<unknown>> = {
  'house-train-points.json': async () => {
    const t = await train();
    return zip(t.area, t.price);
  },
  'house-train-4f.json': async () => {
    const t = await train();
    return zip(t.area, t.rooms, t.age, t.parking, t.price);
  },
  'house-train-loc.json': async () => {
    const t = await train();
    return { rows: zip(t.area, t.location, t.price), fallback: t.fallback, hoods: t.hoods, examples: t.examples };
  },
  'house-vec.json': async () => {
    const t = await train();
    const { w, b } = leastSquares([t.area, t.rooms, t.age, t.parking], t.price);
    const ads = seededPick(t.rows, 40, 7).map((i) => [t.area[i], t.rooms[i], t.age[i], t.parking[i], t.price[i]]);
    return { w: w.map((v) => round(v, 4)), b: round(b, 3), m: t.rows, ads };
  },
  'house-clean-points.json': async () => {
    const c = await fetchJson<CleanFile>('lab-clean.json');
    return zip(c.area, c.ppm2);
  },
  'house-sel-points.json': async () => {
    const o = await fetchJson<OctoberFile>('lab-october.json');
    return { month: o.month, rows: zip(o.area, o.price) };
  },
  'house-heldout.json': async () => {
    const h = await fetchJson<HeldoutFile>('lab-heldout.json');
    return {
      months: h.months, hoods: h.hoods, cost: h.cost, sklearn: h.sklearn, gap: h.gap, rowsN: h.rowCounts,
      rows: zip(h.estimate, h.asked, h.area, h.rooms, h.hood),
    };
  },
};

/** The data a step asks for by its draft file name. */
export function loadStepData(name: string): Promise<unknown> {
  const source = SOURCES[name];
  if (!source) return Promise.reject(new Error(`The Lab has no data called ${name}.`));
  return source();
}

/**
 * Timers, animation frames and window listeners a step starts, so leaving the step stops them all.
 * A step uses these in place of the browser's own functions.
 */
export function createScope() {
  const timers = new Set<number>();
  const frames = new Set<number>();
  const offs: Array<() => void> = [];
  let live = true;
  return {
    setTimeout(fn: () => void, ms?: number): number {
      const id = window.setTimeout(() => {
        timers.delete(id);
        if (live) fn();
      }, ms);
      timers.add(id);
      return id;
    },
    requestAnimationFrame(fn: FrameRequestCallback): number {
      const id = window.requestAnimationFrame((t) => {
        frames.delete(id);
        if (live) fn(t);
      });
      frames.add(id);
      return id;
    },
    cancelAnimationFrame(id: number): void {
      frames.delete(id);
      window.cancelAnimationFrame(id);
    },
    win: {
      addEventListener(type: string, fn: EventListener, opts?: AddEventListenerOptions | boolean): void {
        window.addEventListener(type, fn, opts);
        offs.push(() => window.removeEventListener(type, fn, opts));
      },
    },
    dispose(): void {
      live = false;
      timers.forEach((id) => window.clearTimeout(id));
      frames.forEach((id) => window.cancelAnimationFrame(id));
      offs.forEach((off) => off());
    },
  };
}
