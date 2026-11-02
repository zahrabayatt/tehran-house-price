import type { LabCtx } from './context';
import { multiRun, oneRun } from './context';
import type { MultiState, OneState } from './engine';
import { clamp } from './format';
import type { Cur, LabState, Stage } from './types';

export const PICK_NOTE = 'Pick one to see what to look for.';
export const MAX_ITERS = 5000;

export const INITIAL: LabState = {
  stage: 0,
  view: 0,
  learn: 0,
  w0: 0,
  b0: 0,
  alphaExp: -0.5,
  iters: '200',
  it: 0,
  started: false,
  playing: false,
  bins: 14,
  lo: 0,
  hi: 2.5,
  m: 500,
  nf: 4,
  row: 0,
  degree: 3,
  lamExp: -2,
  split: 75,
  lrs: [0.00001, 0.00005, 0.00014, 0.0002],
  lrInput: '',
  tryNote: PICK_NOTE,
};

/** The iterations box as a whole number from 1 to 5000. A blank or non-numeric box counts as 1. */
export const itersNum = (raw: string): number => Math.round(clamp(Number(raw) || 1, 1, MAX_ITERS));

export type Action =
  | { type: 'goto'; stage: number; stages: Stage[] }
  | { type: 'view'; view: number }
  | { type: 'learn'; learn: 0 | 1 | 2 }
  /** A control that does not affect the run: bins, bounds, degree and so on. */
  | { type: 'set'; patch: Partial<LabState> }
  /** A control that does: moving it throws the run away. */
  | { type: 'clear'; patch: Partial<LabState> }
  | { type: 'start'; reduced: boolean }
  | { type: 'pause' }
  | { type: 'step' }
  | { type: 'scrub'; it: number }
  | { type: 'advance'; by: number }
  | { type: 'reset'; stage: Stage }
  | { type: 'preset'; patch: Partial<LabState>; note: string; run: boolean; reduced: boolean };

const CLEARED = { started: false, playing: false, it: 0 } as const;

/** Settings a step starts with: its own defaults on top of the shared ones. */
function stageStart(stage: Stage): Partial<LabState> {
  const base: Partial<LabState> = {};
  if (stage.train) {
    base.iters = INITIAL.iters;
    base.alphaExp = stage.alpha?.init ?? INITIAL.alphaExp;
  }
  return { ...base, ...(stage.defaults ?? {}) };
}

export function reducer(s: LabState, a: Action): LabState {
  switch (a.type) {
    case 'goto':
      return { ...s, ...CLEARED, ...stageStart(a.stages[a.stage]), stage: a.stage, view: 0, tryNote: PICK_NOTE };
    case 'view':
      return { ...s, view: a.view };
    case 'learn':
      return { ...s, learn: a.learn };
    case 'set':
      return { ...s, ...a.patch };
    case 'clear':
      return { ...s, ...a.patch, ...CLEARED };
    case 'start': {
      const max = itersNum(s.iters);
      if (a.reduced) return { ...s, started: true, it: max, playing: false };
      return { ...s, started: true, it: s.it >= max ? 0 : s.it, playing: true };
    }
    case 'pause':
      return { ...s, playing: false };
    case 'step':
      return { ...s, started: true, playing: false, it: Math.min(itersNum(s.iters), s.it + 1) };
    case 'scrub':
      return { ...s, started: true, playing: false, it: clamp(Math.round(a.it), 0, itersNum(s.iters)) };
    case 'advance': {
      if (!s.playing) return s;
      const max = itersNum(s.iters);
      const next = s.it + a.by;
      return next >= max ? { ...s, it: max, playing: false } : { ...s, it: next };
    }
    case 'reset':
      return { ...INITIAL, stage: s.stage, view: s.view, learn: s.learn, ...stageStart(a.stage) };
    case 'preset': {
      const next = { ...s, ...CLEARED, ...a.patch, tryNote: a.note };
      if (!a.run) return next;
      const max = itersNum(next.iters);
      return a.reduced ? { ...next, started: true, it: max } : { ...next, started: true, playing: true };
    }
  }
}

/** The learning rate a step trains with. The learning-rate step races the first one in its list. */
export function alphaOf(stage: Stage, s: LabState): number {
  return stage.lrs ? (s.lrs[0] ?? 1e-5) : 10 ** s.alphaExp;
}

/** Everything the views need for the current settings: the run up to the replay position, and plain numbers. */
export function computeCur(ctx: LabCtx, stage: Stage, s: LabState): Cur {
  const iters = itersNum(s.iters);
  const alpha = alphaOf(stage, s);
  const multi = stage.kind === 'multi';
  const lam = stage.noPenalty ? 0 : 10 ** s.lamExp;
  const run = s.started ? (multi ? multiRun(ctx, !!stage.scaled, alpha, iters) : oneRun(ctx, s.w0, s.b0, alpha, iters)) : null;
  const it = run ? Math.min(s.it, iters) : 0;

  const start1: OneState = { w: s.w0, b: s.b0, j: 0, gw: 0, gb: 0 };
  let hist1: OneState[] = [];
  let histM: MultiState[] = [];
  if (multi) {
    const startM: MultiState = { w: [0, 0, 0, 0], b: 0, j: ctx.jZero };
    histM = run ? (run.h as MultiState[]).slice(0, it + 1) : [startM];
    if (histM.length === 0) histM = [startM];
  } else {
    hist1 = run ? (run.h as OneState[]).slice(0, it + 1) : [fillStart(ctx, start1)];
    if (hist1.length === 0) hist1 = [fillStart(ctx, start1)];
  }
  const last1 = hist1[hist1.length - 1];
  const lastM = histM[histM.length - 1];
  return {
    view: s.view,
    multi,
    scaled: !!stage.scaled,
    hist1,
    histM,
    w: multi ? 0 : last1.w,
    b: multi ? lastM.b : last1.b,
    j: multi ? lastM.j : last1.j,
    ws: multi ? lastM.w : [],
    run,
    it,
    iters,
    alpha,
    bins: s.bins,
    lo: s.lo,
    hi: s.hi,
    m: s.m,
    nf: s.nf,
    row: s.row,
    degree: s.degree,
    lam,
    lamExp: s.lamExp,
    split: s.split,
    lrs: s.lrs,
  };
}

/** The starting point of a one-feature run, with its real cost and slopes. */
function fillStart(ctx: LabCtx, p: OneState): OneState {
  let j = 0;
  let gw = 0;
  let gb = 0;
  const { x, y, n } = ctx.d;
  for (let i = 0; i < n; i++) {
    const e = p.w * x[i] + p.b - y[i];
    j += e * e;
    gw += e * x[i];
    gb += e;
  }
  return { w: p.w, b: p.b, j: j / (2 * n), gw: gw / n, gb: gb / n };
}
