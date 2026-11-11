import { lab } from '../snippets';
import type { Snippet } from '../snippets';

/** What a step module exports (see step1.js and the others). */
export interface StepModule {
  /** The step's interactive card(s), from its approved design draft. */
  html: string;
  /** The math tab: KaTeX targets (m1, m2, ...) and one plain sentence each. */
  mathHtml: string;
  /** The scikit-learn tab, only where a real equivalent exists. Empty otherwise. */
  skHtml: string;
  mount(ctx: StepContext): () => void;
}

export interface StepContext {
  load(name: string): Promise<unknown>;
  scope(): {
    setTimeout(fn: () => void, ms?: number): number;
    requestAnimationFrame(fn: FrameRequestCallback): number;
    cancelAnimationFrame(id: number): void;
    win: { addEventListener(type: string, fn: EventListener, opts?: AddEventListenerOptions | boolean): void };
    dispose(): void;
  };
}

export interface StepInfo {
  n: number;
  title: string;
  section: 'One feature' | 'Many features' | 'Fitting well';
  /** The real training code this step explains, line by line. */
  code: () => Snippet[];
  load: () => Promise<StepModule>;
}

export const STEPS: StepInfo[] = [
  { n: 1, title: 'Data and notation', section: 'One feature', code: () => [lab('load_xy')], load: () => import('./step1.js') },
  { n: 2, title: 'Cleaning', section: 'One feature', code: () => [lab('clean_bounds')], load: () => import('./step2.js') },
  { n: 3, title: 'The model', section: 'One feature', code: () => [lab('predict_one')], load: () => import('./step3.js') },
  { n: 4, title: 'Cost function', section: 'One feature', code: () => [lab('cost_one')], load: () => import('./step4.js') },
  { n: 5, title: 'Gradient', section: 'One feature', code: () => [lab('gradient_one')], load: () => import('./step5.js') },
  { n: 6, title: 'Gradient descent', section: 'One feature', code: () => [lab('descent_one')], load: () => import('./step6.js') },
  { n: 7, title: 'Vectorization', section: 'Many features', code: () => [lab('dot_loop'), lab('time_dot')], load: () => import('./step7.js') },
  { n: 8, title: 'Multiple features', section: 'Many features', code: () => [lab('gradient_vec')], load: () => import('./step8.js') },
  { n: 9, title: 'Learning rate', section: 'Many features', code: () => [lab('lr_race')], load: () => import('./step9.js') },
  { n: 10, title: 'Feature scaling', section: 'Many features', code: () => [lab('zscore')], load: () => import('./step10.js') },
  {
    n: 11, title: 'Feature engineering', section: 'Many features',
    code: () => [lab('location_lookup'), lab('location_feature'), lab('poly_features')], load: () => import('./step11.js'),
  },
  { n: 12, title: 'Overfitting', section: 'Fitting well', code: () => [lab('fit_degrees')], load: () => import('./step12.js') },
  {
    n: 13, title: 'Regularization', section: 'Fitting well',
    code: () => [lab('compute_cost_reg'), lab('compute_gradient_reg')], load: () => import('./step13.js'),
  },
  { n: 14, title: 'Log price', section: 'Fitting well', code: () => [lab('log_price')], load: () => import('./step14.js') },
  {
    n: 15, title: 'Held-out result', section: 'Fitting well',
    code: () => [lab('split_by_month'), lab('evaluate_held_out')], load: () => import('./step15.js'),
  },
];
