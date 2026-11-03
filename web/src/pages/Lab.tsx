import { useEffect, useMemo, useReducer, useRef } from 'react';
import { CodeWalkthrough } from '../components/CodeWalkthrough';
import { Math as Tex } from '../components/Math';
import { Plot } from '../components/Plot';
import { GITHUB_URL } from '../config';
import type { LabInputs } from '../lab/context';
import { makeCtx, multiRun } from '../lab/context';
import { EXPLANATIONS } from '../lab/explanations';
import { clamp, count, fixed, pow10Label, sciText } from '../lab/format';
import { INITIAL, computeCur, itersNum, reducer } from '../lab/state';
import { STAGES } from '../lab/stages';
import { priceText } from '../lab/stages/shared';
import type { CtlName, LabState, Stage } from '../lab/types';
import './lab.css';

type Ctl = {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  text: string;
  minText: string;
  maxText: string;
  onChange: (v: number) => void;
};

const WB_RANGE = { w: [-10, 60], b: [-50, 40] } as const;

function reducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function Lab({ inputs }: { inputs: LabInputs }) {
  const ctx = useMemo(() => makeCtx(inputs), [inputs]);
  const [s, dispatch] = useReducer(reducer, INITIAL);
  const stage: Stage = STAGES[s.stage];
  const c = useMemo(() => computeCur(ctx, stage, s), [ctx, stage, s]);
  const view = stage.views[Math.min(s.view, stage.views.length - 1)];
  const plot = useMemo(() => view.fn(ctx, c), [ctx, view, c]);
  const topRef = useRef<HTMLDivElement>(null);

  const iters = c.iters;
  const perFrame = Math.max(1, Math.ceil(iters / 150));

  // The run plays one animation frame at a time and stops when the page does.
  useEffect(() => {
    if (!s.playing) return;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const tick = (now: number) => {
      acc += now - last;
      last = now;
      const n = Math.floor(acc / 33);
      if (n > 0) {
        acc -= n * 33;
        dispatch({ type: 'advance', by: n * perFrame });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [s.playing, perFrame]);

  const go = (i: number, scroll = false) => {
    dispatch({ type: 'goto', stage: i, stages: STAGES });
    if (scroll) topRef.current?.scrollIntoView({ block: 'start' });
  };

  /* ---------- controls ---------- */
  const range = (
    id: string, label: string, min: number, max: number, step: number, value: number, text: string,
    minText: string, maxText: string, onChange: (v: number) => void,
  ): Ctl => ({ id, label, min, max, step, value: clamp(value, min, max), text, minText, maxText, onChange });
  const set = (patch: Partial<LabState>) => dispatch({ type: 'set', patch });
  const clear = (patch: Partial<LabState>) => dispatch({ type: 'clear', patch });
  const lam = 10 ** s.lamExp;
  const all: Record<CtlName, Ctl> = {
    w: range('w', 'Weight w', WB_RANGE.w[0], WB_RANGE.w[1], 0.5, c.w, fixed(c.w, 2), '-10', '60', (v) => clear({ w0: v })),
    b: range('b', 'Bias b', WB_RANGE.b[0], WB_RANGE.b[1], 0.5, c.b, fixed(c.b, 2), '-50', '40', (v) => clear({ b0: v })),
    bins: range('bins', 'Histogram bins', 4, 28, 1, s.bins, String(s.bins), '4', '28', (v) => set({ bins: v })),
    lo: range('lo', 'Lowest allowed price', -6, 1, 0.1, s.lo, `${priceText(10 ** s.lo)} billion`, pow10Label(-6), '10', (v) => set({ lo: v })),
    hi: range('hi', 'Highest allowed price', 1, 5, 0.1, s.hi, `${priceText(10 ** s.hi)} billion`, '10', pow10Label(5), (v) => set({ hi: v })),
    m: range('m', 'Rows m', 10, 5000, 10, s.m, count(s.m), '10', '5,000', (v) => set({ m: v })),
    nf: range('nf', 'Features n', 1, 12, 1, s.nf, String(s.nf), '1', '12', (v) => set({ nf: v })),
    row: range('row', 'Listing shown', 0, ctx.d.n - 1, 1, s.row, String(s.row), '0', String(ctx.d.n - 1), (v) => set({ row: v })),
    degree: range('degree', 'Polynomial degree', 1, 10, 1, s.degree, String(s.degree), '1', String(10), (v) => set({ degree: v })),
    lam: range('lam', 'Regularization λ', -2, 3, 0.1, s.lamExp, sciText(lam), pow10Label(-2), pow10Label(3), (v) => set({ lamExp: v })),
    split: range('split', 'Sandbox: share of the sample used for training', 50, 90, 5, s.split, `${s.split}%`, '50%', '90%', (v) => set({ split: v })),
  };
  const extra = typeof stage.ctl === 'function' ? stage.ctl(s.view) : (stage.ctl ?? []);
  const names: CtlName[] = [...(stage.wb ? (['w', 'b'] as CtlName[]) : []), ...extra];

  /* ---------- run ---------- */
  const run = c.run;
  const lrsStage = !!stage.lrs;
  const finished = !!run && c.it >= iters;
  const mini = c.hist1.length > 1 ? c.hist1 : c.histM.length > 1 ? c.histM : [];
  const j0 = mini.length > 0 ? Math.max(mini[0].j, 1e-6) : 1;
  const miniPath = mini
    .map((q, i) => `${i ? 'L' : 'M'}${(18 + (i / iters) * 216).toFixed(1)} ${clamp(112 - (q.j / j0) * 100, 6, 112).toFixed(1)}`)
    .join(' ');

  let runStatus = 'Press Start to train with these settings.';
  if (run) {
    const races = lrsStage ? c.lrs.map((a) => [a, multiRun(ctx, false, a, iters)] as const) : [];
    const failed = races.filter(([, r]) => r.diverged !== null && c.it >= r.diverged);
    if (lrsStage && failed.length > 0) {
      runStatus = `Diverged: ${failed.map(([a, r]) => `α = ${a} at iteration ${r.diverged}`).join('; ')}. Try a smaller learning rate.`;
    } else if (!lrsStage && run.diverged !== null && c.it >= run.diverged) {
      runStatus = `Diverged at iteration ${run.diverged}. Try a smaller learning rate.`;
    } else if (s.playing) runStatus = `Training: iteration ${c.it} of ${iters}.`;
    else if (!finished) runStatus = `Paused at iteration ${c.it} of ${iters}.`;
    else runStatus = `Ran on ${ctx.d.n} sample listings in ${run.ms.toFixed(2)} ms, measured in this browser.`;
  }

  const onStart = () => {
    if (s.playing) dispatch({ type: 'pause' });
    else dispatch({ type: 'start', reduced: reducedMotion() });
  };
  const runLabel = s.playing ? 'Pause' : run && c.it > 0 && c.it < iters ? 'Resume' : 'Start';

  const pick = (i: number) => {
    const t = stage.tries[i];
    const patch = typeof t.set === 'function' ? t.set(ctx) : t.set;
    dispatch({ type: 'preset', patch, note: t.note, run: !!t.run, reduced: reducedMotion() });
  };

  const addLr = () => {
    const v = Number(s.lrInput);
    if (v > 0 && Number.isFinite(v) && !s.lrs.includes(v) && s.lrs.length < 6) set({ lrs: [...s.lrs, v], lrInput: '' });
  };

  const prev = s.stage > 0 ? STAGES[s.stage - 1] : null;
  const next = s.stage < STAGES.length - 1 ? STAGES[s.stage + 1] : null;
  const m = inputs.model;
  const alphaRange = stage.alpha;

  return (
    <div className="lab">
      <div className="lab-layout">
        <nav className="lab-steps" aria-label="Lab steps">
          {STAGES.map((q, i) => (
            <div key={q.title} className="lab-steps__item">
              {q.part ? <div className="lab-steps__head">{q.part}</div> : null}
              <button
                type="button"
                className={i === s.stage ? 'lab-step lab-step--on' : 'lab-step'}
                aria-current={i === s.stage ? 'step' : undefined}
                onClick={() => go(i)}
              >
                <span className="lab-step__num mono" aria-hidden="true">{i + 1}</span>
                {q.title}
              </button>
            </div>
          ))}
        </nav>

        <div className="lab-col">
          <div data-testid="lab-main" className="lab-stack">
            <section className="lab-card" ref={topRef}>
              <div>
                <div className="lab-progress" aria-hidden="true">
                  <div style={{ width: `${(((s.stage + 1) / STAGES.length) * 100).toFixed(1)}%` }} />
                </div>
                <div className="lab-week" data-testid="step-status">
                  Step {s.stage + 1} of {STAGES.length}. {stage.week}
                </div>
                <h2 className="lab-title">{stage.title}</h2>
                <p className="lab-text">{stage.text}</p>
              </div>

              {names.length > 0 ? (
                <div className="lab-controls" data-testid="controls">
                  {names.map((n) => {
                    const k = all[n];
                    return (
                      <div key={n} className="lab-control">
                        <div className="lab-control__top">
                          <label htmlFor={k.id}>{k.label}</label>
                          <span className="mono">{k.text}</span>
                        </div>
                        <div className="lab-control__row">
                          <span>{k.minText}</span>
                          <input
                            id={k.id}
                            type="range"
                            min={k.min}
                            max={k.max}
                            step={k.step}
                            value={k.value}
                            onChange={(e) => k.onChange(Number(e.target.value))}
                          />
                          <span>{k.maxText}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}

              <div role="group" aria-label="Plot view" className="lab-views">
                {stage.views.map((v, i) => (
                  <button
                    key={v.label}
                    type="button"
                    className="lab-pill"
                    aria-pressed={i === s.view}
                    onClick={() => dispatch({ type: 'view', view: i })}
                  >
                    {v.label}
                  </button>
                ))}
              </div>

              <div className="lab-plotrow">
                <div className="lab-plot" data-testid="plot">
                  <Plot spec={plot} label={`${stage.title}: ${view.label}`} />
                </div>
                <aside className="lab-stats">
                  <dl data-testid="stats">
                    {stage.stats(ctx, c).map((r) => (
                      <div key={r.k} className="lab-stat">
                        <dt>{r.k}</dt>
                        <dd className="mono">{r.v}</dd>
                      </div>
                    ))}
                  </dl>
                  {stage.train && !stage.lrs ? (
                    <div className="lab-mini">
                      <div className="lab-mini__title">Cost over iterations</div>
                      <svg viewBox="0 0 240 130" role="img" aria-label="Cost over iterations">
                        <path d="M18 6 L18 112 L234 112" fill="none" stroke="var(--mut)" strokeWidth={1} />
                        <path d={miniPath || 'M18 112'} fill="none" stroke="var(--ac)" strokeWidth={2} />
                      </svg>
                    </div>
                  ) : null}
                </aside>
              </div>

              {stage.train ? (
                <>
                  <div className="lab-train" data-testid="train-bar">
                    <div className="lab-train__group">
                      <span className="lab-label">Gradient descent</span>
                      <div className="lab-buttons">
                        <button type="button" className="lab-btn lab-btn--solid" onClick={onStart}>
                          {runLabel}
                        </button>
                        <button type="button" className="lab-btn" onClick={() => dispatch({ type: 'step' })}>
                          Step
                        </button>
                        <button type="button" className="lab-btn" onClick={() => dispatch({ type: 'reset', stage })}>
                          Reset
                        </button>
                      </div>
                    </div>
                    <div className="lab-train__group">
                      <label htmlFor="iters" className="lab-label">
                        Iterations
                      </label>
                      <input
                        id="iters"
                        type="number"
                        className="lab-number"
                        min={1}
                        max={5000}
                        step={1}
                        value={s.iters}
                        onChange={(e) => clear({ iters: e.target.value })}
                        onBlur={() => set({ iters: String(itersNum(s.iters)) })}
                      />
                    </div>
                    {alphaRange ? (
                      <div className="lab-control lab-control--wide">
                        <div className="lab-control__top">
                          <label htmlFor="alpha" className="lab-label">
                            Learning rate α
                          </label>
                          <span className="mono">{sciText(c.alpha)}</span>
                        </div>
                        <div className="lab-control__row">
                          <span>{pow10Label(alphaRange.min)}</span>
                          <input
                            id="alpha"
                            type="range"
                            min={alphaRange.min}
                            max={alphaRange.max}
                            step={0.05}
                            value={clamp(s.alphaExp, alphaRange.min, alphaRange.max)}
                            onChange={(e) => clear({ alphaExp: Number(e.target.value) })}
                          />
                          <span>{sciText(10 ** alphaRange.max)}</span>
                        </div>
                      </div>
                    ) : null}
                    {stage.lrs ? (
                      <div className="lab-train__group lab-train__group--wide">
                        <span className="lab-label">Learning rates to compare</span>
                        <div className="lab-chips">
                          {s.lrs.map((a) => (
                            <button
                              key={a}
                              type="button"
                              className="lab-chip mono"
                              aria-label={`Remove learning rate ${a}`}
                              onClick={() => set({ lrs: s.lrs.filter((q) => q !== a) })}
                            >
                              {a} ×
                            </button>
                          ))}
                          <label htmlFor="newlr" className="visually-hidden">
                            New learning rate
                          </label>
                          <input
                            id="newlr"
                            type="number"
                            className="lab-number lab-number--small"
                            min={0}
                            step="any"
                            value={s.lrInput}
                            onChange={(e) => set({ lrInput: e.target.value })}
                          />
                          <button type="button" className="lab-btn lab-btn--small" onClick={addLr}>
                            Add
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                  <div className="lab-replay">
                    <label htmlFor="scrub" data-testid="replay-label">
                      Replay: iteration {c.it} of {iters}
                    </label>
                    <input
                      id="scrub"
                      type="range"
                      min={0}
                      max={iters}
                      step={1}
                      value={c.it}
                      onChange={(e) => dispatch({ type: 'scrub', it: Number(e.target.value) })}
                    />
                    <span className="lab-note" data-testid="run-status" role="status" aria-live={s.playing ? 'off' : 'polite'}>
                      {runStatus}
                    </span>
                  </div>
                </>
              ) : null}

              <div className="lab-try">
                <span className="lab-label">Try this</span>
                <div role="group" aria-label="Try this" className="lab-buttons">
                  {stage.tries.map((t, i) => (
                    <button key={t.label} type="button" className="lab-try__btn" onClick={() => pick(i)}>
                      {t.label}
                    </button>
                  ))}
                </div>
                <span className="lab-note" data-testid="try-note">
                  {s.tryNote}
                </span>
              </div>
            </section>

            <section className="lab-card lab-card--explain">
              <div role="group" aria-label="Explanation section" className="lab-tabs">
                {(['The math', 'The code', 'scikit-learn'] as const).map((label, i) => (
                  <button
                    key={label}
                    type="button"
                    className="lab-tab"
                    aria-pressed={s.learn === i}
                    onClick={() => dispatch({ type: 'learn', learn: i as 0 | 1 | 2 })}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {s.learn === 0 ? (
                <div className="lab-explain" data-testid="math-tab">
                  <div>
                    <h3>Notation</h3>
                    <div className="lab-scroll" role="region" aria-label="Notation table" tabIndex={0}>
                      <table className="lab-table">
                        <thead>
                          <tr>
                            <th scope="col">Symbol</th>
                            <th scope="col">Meaning here</th>
                            <th scope="col">In code</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stage.notation.map((n) => (
                            <tr key={n.s}>
                              <td>
                                <Tex tex={n.s} />
                              </td>
                              <td>{n.m}</td>
                              <td className="mono">{n.c}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div>
                    <h3>The math, step by step</h3>
                    <div className="lab-eqs">
                      {stage.math.map((e) => (
                        <div key={e.tex} className="lab-eq">
                          <div className="lab-eq__tex" role="region" aria-label="Equation" tabIndex={0}>
                            <Tex tex={e.tex} display />
                          </div>
                          <p>{e.why}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h3>Worked example, live</h3>
                    <p className="lab-note">These numbers come from the current settings above and change with them.</p>
                    <pre className="lab-worked mono" data-testid="worked" role="region" aria-label="Worked example" tabIndex={0}>
                      {stage.worked(ctx, c)}
                    </pre>
                  </div>
                </div>
              ) : null}

              {s.learn === 1 ? (
                <div data-testid="code-tab">
                  <h3>The code, explained line by line</h3>
                  <CodeWalkthrough blocks={stage.code} explanations={EXPLANATIONS} githubUrl={GITHUB_URL} />
                </div>
              ) : null}

              {s.learn === 2 ? (
                <div data-testid="sk-tab">
                  <h3>The same thing with scikit-learn</h3>
                  <pre className="lab-sk mono" role="region" aria-label="scikit-learn code" tabIndex={0}>{stage.sk}</pre>
                  <p className="lab-note lab-note--body">{stage.skNote}</p>
                </div>
              ) : null}
            </section>
          </div>

          <nav aria-label="Step navigation" className="lab-pager">
            {prev ? (
              <button type="button" className="lab-btn lab-btn--big" onClick={() => go(s.stage - 1, true)}>
                ← {prev.title}
              </button>
            ) : null}
            <span className="lab-pager__gap" />
            {next ? (
              <button type="button" className="lab-btn lab-btn--big lab-btn--solid" onClick={() => go(s.stage + 1, true)}>
                Next: {next.title} →
              </button>
            ) : null}
          </nav>

          <section className="lab-info">
            {s.stage === STAGES.length - 1 ? (
              <>
            <div className="lab-info__card" data-testid="live-run">
              <h3>Live model training run</h3>
              <p>
                {m.rows ? `${count(m.rows.train)} training rows, ${count(m.rows.selection)} selection rows and ${count(m.rows.held_out)} held-out rows. ` : ''}
                {m.hyperparameters
                  ? `${count(m.hyperparameters.iterations)} iterations at α = ${m.hyperparameters.alpha}, λ = ${m.hyperparameters.lambda}. `
                  : ''}
                {m.runtime_ms !== undefined ? `Runtime ${(m.runtime_ms / 1000).toFixed(2)} s. ` : ''}
                {m.environment ? `Python ${m.environment.python}, NumPy ${m.environment.numpy}, ${m.environment.os}. ` : ''}
                Saved during the real run, never typed by hand.
              </p>
            </div>
            <div className="lab-info__card" data-testid="vs-sklearn">
              <h3>From scratch vs scikit-learn</h3>
              <p>
                {m.cost ? `NumPy cost ${m.cost.held_out.toFixed(3)}` : 'NumPy cost unknown'}
                {m.sklearn_cost
                  ? `, scikit-learn cost ${m.sklearn_cost.linear_regression.toFixed(3)}${m.sklearn_cost.ridge !== undefined ? ` (Ridge ${m.sklearn_cost.ridge.toFixed(3)})` : ''}`
                  : ''}
                , on the same held-out listings.
              </p>
            </div>
              </>
            ) : null}
            <div className="lab-info__card" data-testid="run-it">
              <h3>Run it yourself</h3>
              <pre className="mono">python -m training.train</pre>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
