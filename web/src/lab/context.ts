import type { Listing } from '../model/siteData';
import type { Model } from '../model/types';
import { makeLabData, polyCost, polyFitGD, predPoly, runMulti, runOne } from './engine';
import type { LabData, MultiRun, MultiState, OneRun, OneState, PolyFit, Sample } from './engine';
import { mean, niceTop, percentile } from './format';
import type { Domain } from './plotkit';

/** The two sizes of the polynomial stages: the 16 listings every fit trains on, and the sweep cap. */
export const SUBSET_SIZE = 16;
export const POLY_ITERS = 500;

export interface LabInputs {
  sample: Sample;
  listings: Listing[];
  model: Model;
}

/** Everything a view or stage reads, built once from the sample and the shipped model. */
export interface LabCtx {
  d: LabData;
  model: Model;
  listings: Listing[];
  /** Prices of real ads that the live cleaning removes, in billions. */
  dirty: number[];
  /** The one-feature line with the lowest cost, found in closed form. Used only to frame plots. */
  wp: number;
  bp: number;
  /** Mean of x and of x squared, where x is area in hundreds of square metres. */
  mx: number;
  mx2: number;
  /** Cost of the best one-feature line. */
  jStar: number;
  /** Cost of the all-zero model, the start of every many-feature run. */
  jZero: number;
  /** Axis limits from the 99th percentile of the sample, so a few huge listings cannot squash the rest. */
  dom: { area: Domain; price: Domain; age: Domain };
  /** How many sample listings sit beyond the top of each axis. */
  beyond: { area: number; price: number; age: number };
  /** Rows the polynomial stages train on: spread evenly from the smallest to the largest area. */
  sub: { idx: number[]; z: number[]; y: number[]; area: number[] };
  /** At most 150 rows, evenly spread, for plots with one dot per listing in several panels. */
  panel: number[];
  memo: <T>(key: string, make: () => T) => T;
}

export function makeCtx(inputs: LabInputs): LabCtx {
  const d = makeLabData(inputs.sample);
  const mx = mean(d.x);
  const mx2 = mean(d.x.map((v) => v * v));
  const ybar = mean(d.y);
  const cov = mean(d.x.map((v, i) => v * d.y[i]));
  const wp = (cov - mx * ybar) / (mx2 - mx * mx);
  const bp = ybar - wp * mx;
  let jStar = 0;
  for (let i = 0; i < d.n; i++) jStar += (wp * d.x[i] + bp - d.y[i]) ** 2;
  jStar /= 2 * d.n;

  const areas = d.rows.map((r) => r.area);
  const ages = d.rows.map((r) => r.age);
  const top = (v: number[]): Domain => [0, niceTop(percentile(v, 99))];
  const dom = { area: top(areas), price: top(d.y), age: top(ages) };
  const over = (v: number[], t: number) => v.filter((x) => x > t).length;

  const order = d.rows.map((_, i) => i).sort((a, b) => d.rows[a].area - d.rows[b].area);
  const idx = Array.from({ length: SUBSET_SIZE }, (_, k) => order[Math.floor(((k + 0.5) / SUBSET_SIZE) * order.length)]);
  const sub = { idx, z: idx.map((i) => d.zs[i]), y: idx.map((i) => d.y[i]), area: idx.map((i) => d.rows[i].area) };

  const stride = Math.max(1, Math.ceil(d.n / 150));
  const panel = d.rows.map((_, i) => i).filter((i) => i % stride === 0);

  const cache = new Map<string, unknown>();
  const memo = <T,>(key: string, make: () => T): T => {
    if (!cache.has(key)) cache.set(key, make());
    return cache.get(key) as T;
  };

  return {
    d,
    model: inputs.model,
    listings: inputs.listings,
    dirty: inputs.sample.dirty_prices ?? [],
    wp, bp, mx, mx2, jStar,
    jZero: mean(d.y.map((v) => v * v)) / 2,
    dom,
    beyond: { area: over(areas, dom.area[1]), price: over(d.y, dom.price[1]), age: over(ages, dom.age[1]) },
    sub,
    panel,
    memo,
  };
}

export type { MultiRun, MultiState, OneRun, OneState, PolyFit };

/* ---------- polynomial fits ---------- */

/**
 * The step size for a polynomial fit. Every column is z-scored, so the curvature of the cost
 * along any direction is at most degree + 1 plus the penalty's lambda / m. Taking the inverse of
 * that sum is half the largest stable step, so descent always converges and never blows up.
 */
export const polyAlpha = (degree: number, lambda: number, rows: number) => 1 / (degree + 1 + lambda / rows);

/** Still falling noticeably over the last 50 updates, or stopped early by divergence. */
export function notConverged(fit: PolyFit): boolean {
  if (fit.diverged !== null) return true;
  const h = fit.history;
  if (h.length < 51) return true;
  const last = h[h.length - 1];
  return Math.abs(h[h.length - 51] - last) > 1e-3 * Math.max(Math.abs(last), 1e-12);
}

/** A degree-`degree` fit on the 16 listings, memoized per (degree, lambda, iterations). */
export function fitSubset(ctx: LabCtx, degree: number, lambda: number, iters = POLY_ITERS): PolyFit {
  return ctx.memo(`sub|${degree}|${lambda}|${iters}`, () =>
    polyFitGD(ctx.sub.z, ctx.sub.y, degree, lambda, polyAlpha(degree, lambda, ctx.sub.z.length), iters),
  );
}

/** A fit on the first k sample listings, memoized the same way. */
export function fitFirst(ctx: LabCtx, k: number, degree: number, lambda: number, iters = POLY_ITERS): PolyFit {
  return ctx.memo(`first|${k}|${degree}|${lambda}|${iters}`, () =>
    polyFitGD(ctx.d.zs.slice(0, k), ctx.d.y.slice(0, k), degree, lambda, polyAlpha(degree, lambda, k), iters),
  );
}

/** Prediction in billions for a listing of `area` square metres. */
export function predictArea(ctx: LabCtx, fit: PolyFit, area: number): number {
  return predPoly(fit, (area - ctx.d.mus[0]) / ctx.d.sds[0]);
}

/** Data cost of a fit on the 16 training listings. */
export function subsetCost(ctx: LabCtx, fit: PolyFit): number {
  return polyCost(fit, ctx.sub.z, ctx.sub.y);
}

/** Cost of a fit on the sample listings after the first k. */
export function heldCost(ctx: LabCtx, fit: PolyFit, k: number): number {
  return polyCost(fit, ctx.d.zs.slice(k), ctx.d.y.slice(k));
}

export const splitRows = (ctx: LabCtx, percent: number) => Math.floor((ctx.d.n * percent) / 100);

/* ---------- gradient descent runs ---------- */

/** A many-feature run on the raw or the z-scored features, memoized so a replay never recomputes it. */
export function multiRun(ctx: LabCtx, scaled: boolean, alpha: number, iters: number): MultiRun {
  return ctx.memo(`multi|${scaled}|${alpha}|${iters}`, () => runMulti(scaled ? ctx.d.Xz : ctx.d.X, ctx.d.y, alpha, iters));
}

/** A one-feature run from (w0, b0), memoized. */
export function oneRun(ctx: LabCtx, w0: number, b0: number, alpha: number, iters: number): OneRun {
  return ctx.memo(`one|${w0}|${b0}|${alpha}|${iters}`, () => runOne(ctx.d, w0, b0, alpha, iters));
}
