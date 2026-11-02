import type { Snippet } from 'virtual:lab-snippets';
import type { PlotSpec } from '../components/Plot';
import type { LabCtx } from './context';
import type { MultiRun, MultiState, OneRun, OneState } from './engine';

/** What the person has set. Every control and the run's position live here. */
export interface LabState {
  stage: number;
  view: number;
  /** Which explanation tab: 0 math, 1 code, 2 scikit-learn. */
  learn: 0 | 1 | 2;
  w0: number;
  b0: number;
  /** log10 of the learning rate. */
  alphaExp: number;
  /** The iterations box as typed. Clamped to 1 through 5000 whenever it is used. */
  iters: string;
  /** Position of the replay, 0 to iters. */
  it: number;
  /** True once a run exists for these settings. Moving w, b, alpha or the iterations clears it. */
  started: boolean;
  playing: boolean;
  bins: number;
  /** log10 of the lowest and highest allowed price. */
  lo: number;
  hi: number;
  m: number;
  nf: number;
  row: number;
  degree: number;
  /** log10 of the regularization strength. */
  lamExp: number;
  /** Percent of the sample used for training in the sandbox split. */
  split: number;
  lrs: number[];
  lrInput: string;
  tryNote: string;
}

/** The current point of the run, plus every setting the views need, resolved to numbers. */
export interface Cur {
  view: number;
  multi: boolean;
  scaled: boolean;
  /** One-feature runs: the states up to the replay position. */
  hist1: OneState[];
  /** Many-feature runs: the same. */
  histM: MultiState[];
  w: number;
  b: number;
  /** Cost at the current point. */
  j: number;
  /** Weights at the current point of a many-feature run. */
  ws: number[];
  run: OneRun | MultiRun | null;
  it: number;
  iters: number;
  alpha: number;
  bins: number;
  lo: number;
  hi: number;
  m: number;
  nf: number;
  row: number;
  degree: number;
  lam: number;
  lamExp: number;
  split: number;
  lrs: number[];
}

export type ViewFn = (ctx: LabCtx, c: Cur) => PlotSpec;
export interface Stat { k: string; v: string }
export type CtlName = 'w' | 'b' | 'bins' | 'lo' | 'hi' | 'm' | 'nf' | 'row' | 'degree' | 'lam' | 'split';

/** A symbol (TeX), what it means here, and its name in the code. */
export interface Notation { s: string; m: string; c: string }
/** One equation (TeX) and why it looks the way it does. */
export interface MathStep { tex: string; why: string }

export interface Try {
  label: string;
  note: string;
  set: Partial<LabState> | ((ctx: LabCtx) => Partial<LabState>);
  /** Press Start after applying the settings. */
  run?: boolean;
}

/** Exponent limits of the learning-rate slider and where it starts. */
export interface AlphaRange { min: number; max: number; init: number }

export interface Stage {
  /** Heading above this step in the list, for the first step of a part. */
  part?: string;
  week: string;
  title: string;
  text: string;
  /** Shows the w and b sliders. */
  wb?: boolean;
  /** Shows the training bar: Start, Pause, Step, Reset, iterations and the replay slider. */
  train?: boolean;
  alpha?: AlphaRange;
  /** Shows the list of learning rates to compare. */
  lrs?: boolean;
  /** Trains on four features instead of one. */
  kind?: 'multi';
  /** Trains on z-scored features. */
  scaled?: boolean;
  /** Fit polynomials without any penalty, because the penalty is not introduced yet. */
  noPenalty?: boolean;
  /** Settings applied on arrival. */
  defaults?: Partial<LabState>;
  /** Extra controls; a function when they depend on the plot view. */
  ctl?: CtlName[] | ((view: number) => CtlName[]);
  views: Array<{ label: string; fn: ViewFn }>;
  stats: (ctx: LabCtx, c: Cur) => Stat[];
  notation: Notation[];
  math: MathStep[];
  /** Worked example with the live numbers. */
  worked: (ctx: LabCtx, c: Cur) => string;
  /** Code blocks read from the Python source. */
  code: Snippet[];
  sk: string;
  skNote: string;
  tries: Try[];
}
