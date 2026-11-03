/**
 * The Lab's math, in plain TypeScript with no React and no imports.
 *
 * Everything here runs on the sample rows in sample.json and nothing else. It never
 * reads or writes the trained model, and it never changes its inputs, so a Lab
 * experiment cannot disturb the Estimate page.
 *
 * The maths is training/model.py, line for line:
 *   cost      J = 1/(2m) * sum(e^2) + lambda/(2m) * sum(w^2),   e = X w + b - y
 *   gradient  dJ/dw = X^T e / m + lambda/m * w,   dJ/db = mean(e)
 * and b is never penalized. tests compare with Python within 1e-6 relative.
 *
 * Runs are numbered by state. A run of `iters` updates has iters + 1 states, 0 to
 * iters: state k is the point after k updates, and state 0 is the starting point.
 * A run stops at the first state whose cost is not finite or is above COST_LIMIT.
 * That state is not kept, and `diverged` is its number, so `h.length === diverged`.
 * A run that finishes has `diverged === null`. Every kept number is finite.
 */

/** A run is called diverged once its cost passes this, or stops being a number. */
export const COST_LIMIT = 1e9;

/** One row of sample.json. Prices are in billions of toman. */
export interface SampleRow {
  area: number;
  rooms: number;
  age: number;
  parking: number;
  elevator: number;
  storage: number;
  price: number;
}

/** The shape of web/public/data/sample.json. */
export interface Sample {
  rows: SampleRow[];
  dirty_prices?: number[];
}

/** What the Lab stages work from. */
export interface LabData {
  rows: SampleRow[];
  n: number;
  /** Area in hundreds of square metres, the single feature of the first stages. */
  x: number[];
  /** Asking price in billions of toman. */
  y: number[];
  /** Raw features per row: area, rooms, age, parking. */
  X: number[][];
  /** The same features z-scored per column. */
  Xz: number[][];
  /** Column means and standard deviations behind Xz. */
  mus: number[];
  sds: number[];
  /** Area z-scored, the x of the polynomial stages. */
  zs: number[];
}

/** Enough of LabData for the one-feature functions. */
export type Fit1D = Pick<LabData, 'n' | 'x' | 'y'>;

export interface OneState { w: number; b: number; j: number; gw: number; gb: number }
export interface MultiState { w: number[]; b: number; j: number }
export interface OneRun { h: OneState[]; diverged: number | null; ms: number }
export interface MultiRun { h: MultiState[]; diverged: number | null; ms: number }

/** A fitted polynomial: theta = [b, w1..wd] over the z-scored powers x^1..x^d. */
export interface PolyModel { theta: number[]; mu: number[]; sigma: number[] }
export interface PolyFit extends PolyModel {
  /** Data cost 1/(2m) sum(e^2) at theta, without the penalty. */
  cost: number;
  /** Cost with the penalty after each update, like model.gradient_descent's J_history. */
  history: number[];
  diverged: number | null;
  ms: number;
}

const mean = (v: number[]) => {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i];
  return s / v.length;
};

/** Population mean and standard deviation. A constant column gets sd = 1. */
export function zscore(v: number[]): { z: number[]; mu: number; sd: number } {
  const mu = mean(v);
  let s = 0;
  for (let i = 0; i < v.length; i++) s += (v[i] - mu) * (v[i] - mu);
  const sd = Math.sqrt(s / v.length) || 1;
  return { z: v.map((e) => (e - mu) / sd), mu, sd };
}

/** Build everything the stages use from the sample. */
export function makeLabData(sample: Sample): LabData {
  const rows = sample.rows.map((r) => ({ ...r }));
  const X = rows.map((r) => [r.area, r.rooms, r.age, r.parking]);
  const cols = [0, 1, 2, 3].map((j) => zscore(X.map((r) => r[j])));
  return {
    rows,
    n: rows.length,
    x: rows.map((r) => r.area / 100),
    y: rows.map((r) => r.price),
    X,
    Xz: X.map((_, i) => cols.map((c) => c.z[i])),
    mus: cols.map((c) => c.mu),
    sds: cols.map((c) => c.sd),
    zs: cols[0].z.slice(),
  };
}

/** Counts of values in `bins` equal bins over [lo, hi). Values outside are ignored. */
export function hist(vals: number[], lo: number, hi: number, bins: number): number[] {
  const c = new Array<number>(bins).fill(0);
  for (const v of vals) {
    const i = Math.floor(((v - lo) / (hi - lo)) * bins);
    if (i >= 0 && i < bins) c[i]++;
  }
  return c;
}

const diverges = (j: number) => !Number.isFinite(j) || j > COST_LIMIT;

/** Cost of f(x) = w x + b on the one-feature data. */
export function jOf(d: Fit1D, w: number, b: number): number {
  let s = 0;
  for (let i = 0; i < d.n; i++) {
    const e = w * d.x[i] + b - d.y[i];
    s += e * e;
  }
  return s / (2 * d.n);
}

/** Gradient [dJ/dw, dJ/db] of jOf. */
export function gradOf(d: Fit1D, w: number, b: number): [number, number] {
  let gw = 0;
  let gb = 0;
  for (let i = 0; i < d.n; i++) {
    const e = w * d.x[i] + b - d.y[i];
    gw += e * d.x[i];
    gb += e;
  }
  return [gw / d.n, gb / d.n];
}

/** Batch gradient descent on one feature from (w0, b0), keeping every state. */
export function runOne(d: Fit1D, w0: number, b0: number, alpha: number, iters: number): OneRun {
  const t0 = performance.now();
  const h: OneState[] = [];
  let diverged: number | null = null;
  let w = w0;
  let b = b0;
  for (let i = 0; i <= iters; i++) {
    const j = jOf(d, w, b);
    if (diverges(j)) { diverged = i; break; }
    const [gw, gb] = gradOf(d, w, b);
    h.push({ w, b, j, gw, gb });
    w -= alpha * gw;
    b -= alpha * gb;
  }
  return { h, diverged, ms: performance.now() - t0 };
}

/** Descent on many features from w = 0, b = 0, with an optional squared penalty on w. */
function descend(X: number[][], y: number[], alpha: number, iters: number, lambda: number) {
  const m = X.length;
  const n = X[0].length;
  const h: MultiState[] = [];
  let diverged: number | null = null;
  let w = new Array<number>(n).fill(0);
  let b = 0;
  for (let t = 0; t <= iters; t++) {
    const g = new Array<number>(n).fill(0);
    let gb = 0;
    let s = 0;
    for (let i = 0; i < m; i++) {
      const row = X[i];
      let e = b - y[i];
      for (let j = 0; j < n; j++) e += w[j] * row[j];
      s += e * e;
      for (let j = 0; j < n; j++) g[j] += e * row[j];
      gb += e;
    }
    let penalty = 0;
    for (let j = 0; j < n; j++) penalty += w[j] * w[j];
    const j = s / (2 * m) + (lambda / (2 * m)) * penalty;
    if (diverges(j)) { diverged = t; break; }
    h.push({ w: w.slice(), b, j });
    w = w.map((v, k) => v - alpha * (g[k] / m + (lambda / m) * v));
    b -= (alpha * gb) / m;
  }
  return { h, diverged };
}

/** Batch gradient descent on every column of X (rows are listings) from zero. */
export function runMulti(X: number[][], y: number[], alpha: number, iters: number): MultiRun {
  const t0 = performance.now();
  const { h, diverged } = descend(X, y, alpha, iters, 0);
  return { h, diverged, ms: performance.now() - t0 };
}

/** Prediction of a fitted polynomial at x. */
export function predPoly(f: PolyModel, x: number): number {
  let s = f.theta[0];
  for (let p = 1; p < f.theta.length; p++) {
    s += f.theta[p] * ((Math.pow(x, p) - f.mu[p - 1]) / f.sigma[p - 1]);
  }
  return s;
}

/** Data cost 1/(2m) sum(e^2) of a fitted polynomial on (xs, ys), without any penalty. */
export function polyCost(f: PolyModel, xs: number[], ys: number[]): number {
  let s = 0;
  for (let i = 0; i < xs.length; i++) {
    const e = predPoly(f, xs[i]) - ys[i];
    s += e * e;
  }
  return s / (2 * xs.length);
}

/**
 * Polynomial regression by gradient descent. The features are x^1 .. x^degree, each
 * z-scored on its own (they differ wildly in size), and descent starts from zero.
 * lambda is the squared penalty on the weights, never on the bias. Unlike the mockup,
 * which solved this exactly, a strong lambda here shrinks the weights the way the
 * course describes, and a too-large alpha diverges visibly.
 */
export function polyFitGD(
  x: number[], y: number[], degree: number, lambda: number, alpha: number, iters: number,
): PolyFit {
  const t0 = performance.now();
  const powers = Array.from({ length: degree }, (_, p) => zscore(x.map((v) => Math.pow(v, p + 1))));
  const P = x.map((_, i) => powers.map((c) => c.z[i]));
  const { h, diverged } = descend(P, y, alpha, iters, lambda);
  const last = h[h.length - 1];
  const fit: PolyModel = {
    theta: [last.b, ...last.w],
    mu: powers.map((c) => c.mu),
    sigma: powers.map((c) => c.sd),
  };
  return {
    ...fit,
    cost: polyCost(fit, x, y),
    history: h.slice(1).map((s) => s.j),
    diverged,
    ms: performance.now() - t0,
  };
}

/** The Lab's polynomial fit. The mockup solved it exactly; this descends instead. */
export const polyFit = polyFitGD;
