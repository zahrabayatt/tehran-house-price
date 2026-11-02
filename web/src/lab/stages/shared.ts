import { jOf, gradOf } from '../engine';
import { fixed, n3 } from '../format';
import type { LabCtx } from '../context';
import type { Cur, Stat, ViewFn } from '../types';

/** Write TeX without doubling every backslash. */
export const tex = String.raw;

export const view = (label: string, fn: ViewFn) => ({ label, fn });

export const costAt = (ctx: LabCtx, c: Cur) => jOf(ctx.d, c.w, c.b);
export const slopesAt = (ctx: LabCtx, c: Cur) => gradOf(ctx.d, c.w, c.b);

export const modelStats = (ctx: LabCtx, c: Cur): Stat[] => [
  { k: 'w', v: fixed(c.w, 2) },
  { k: 'b', v: fixed(c.b, 2) },
  { k: 'First listing, f(x)', v: fixed(c.w * ctx.d.x[0] + c.b, 2) },
  { k: 'First listing, y', v: fixed(ctx.d.y[0], 2) },
];

export const costStats = (ctx: LabCtx, c: Cur): Stat[] => [
  { k: 'w', v: fixed(c.w, 2) },
  { k: 'b', v: fixed(c.b, 2) },
  { k: 'Cost J', v: n3(costAt(ctx, c)) },
];

export const slopeStats = (ctx: LabCtx, c: Cur): Stat[] => {
  const g = slopesAt(ctx, c);
  return [
    { k: 'Cost J', v: n3(costAt(ctx, c)) },
    { k: '∂J/∂w', v: n3(g[0]) },
    { k: '∂J/∂b', v: n3(g[1]) },
  ];
};

export const trainStats = (ctx: LabCtx, c: Cur): Stat[] => {
  const g = slopesAt(ctx, c);
  return [
    { k: 'Cost J', v: n3(costAt(ctx, c)) },
    { k: 'w', v: fixed(c.w, 3) },
    { k: 'b', v: fixed(c.b, 3) },
    { k: '∂J/∂w', v: n3(g[0]) },
    { k: '∂J/∂b', v: n3(g[1]) },
  ];
};

/** A price bound in billions, as a short number. */
export function priceText(v: number): string {
  if (v >= 100) return String(Math.round(v));
  if (v >= 1) return v.toFixed(1).replace(/\.0$/, '');
  if (v >= 0.001) return v.toPrecision(2);
  return v.toExponential(0);
}
