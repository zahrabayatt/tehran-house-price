import katex from 'katex';
import { describe, expect, it } from 'vitest';
import { codeRows } from '../components/CodeWalkthrough';
import { EXPLANATIONS } from './explanations';
import { allBlocks, lab } from './snippets';
import { STAGES } from './stages';
import { ctx } from './testData';
import { INITIAL, computeCur, reducer } from './state';
import type { LabState } from './types';

const TITLES = [
  'Data and notation', 'Cleaning', 'The model', 'Cost function', 'Gradient', 'Gradient descent', 'Vectorization',
  'Multiple features', 'Learning rate', 'Feature scaling', 'Feature engineering', 'Overfitting', 'Regularization',
  'Held-out result',
];

const EXCLUDED = /\b(MSE|RMSE|L1|L2|Accuracy|Precision|Recall|F1|ROC-AUC)\b/i;
/** A word a step may use only from the step that introduces it (1-based). */
const INTRODUCED: Array<[RegExp, number]> = [
  [/\bcost\b/i, 4],
  [/gradient|slope|derivative|∂/i, 5],
  [/learning rate|iteration|descent|diverg|α/i, 6],
  [/vectoriz|dot product|numpy/i, 7],
  [/z-score|standard deviation/i, 10],
  [/polynomial|degree/i, 11],
  [/overfit|underfit/i, 12],
  [/regulariz|λ|lambda|penalt/i, 13],
  [/held-out|held out/i, 14],
];

/** Everything a step says on its own, whatever the settings: copy, math text, notes and code. */
function words(i: number): string {
  const st = STAGES[i];
  const code = st.code.flatMap((b) => b.lines.concat(Object.values(EXPLANATIONS[b.name] ?? {})));
  return [
    st.week, st.title, st.text, st.sk, st.skNote,
    ...st.views.map((v) => v.label),
    ...st.notation.flatMap((n) => [n.s, n.m, n.c]),
    ...st.math.flatMap((m) => [m.tex, m.why]),
    ...st.tries.flatMap((t) => [t.label, t.note]),
    ...code,
  ].join('\n');
}

describe('the 14 steps', () => {
  it('are in design order under three parts', () => {
    expect(STAGES.map((s) => s.title)).toEqual(TITLES);
    expect(STAGES.map((s, i) => (s.part ? i + 1 : 0)).filter(Boolean)).toEqual([1, 7, 12]);
    expect(STAGES.filter((s) => s.part).map((s) => s.part)).toEqual(['One feature', 'Many features', 'Generalizing']);
  });

  it('show the training bar only at Gradient descent and the training steps after it', () => {
    expect(STAGES.map((s, i) => (s.train ? i + 1 : 0)).filter(Boolean)).toEqual([6, 8, 9, 10]);
    // Steps 3 to 5 are manual: they have w and b sliders but nothing that runs.
    for (const i of [2, 3, 4]) expect(STAGES[i].train).toBeFalsy();
    expect(STAGES.slice(0, 5).some((s) => s.alpha || s.lrs)).toBe(false);
  });

  it('have views, stats, math, code and presets', () => {
    for (const s of STAGES) {
      expect(s.views.length, s.title).toBeGreaterThan(0);
      expect(s.math.length, s.title).toBeGreaterThan(0);
      expect(s.code.length, s.title).toBeGreaterThan(0);
      expect(s.tries.length, s.title).toBeGreaterThan(0);
      const cur = computeCur(ctx, s, { ...INITIAL, stage: STAGES.indexOf(s) });
      expect(s.stats(ctx, cur).length, s.title).toBeGreaterThan(0);
      expect(s.worked(ctx, cur).length, s.title).toBeGreaterThan(10);
    }
  });
});

describe('teaching order', () => {
  it('no step uses a word before the step that introduces it', () => {
    STAGES.forEach((_, i) => {
      for (const [word, first] of INTRODUCED) {
        if (i + 1 < first) {
          const hit = words(i).match(word);
          expect(hit, `step ${i + 1} (${TITLES[i]}) uses "${hit?.[0]}", introduced at step ${first}`).toBeNull();
        }
      }
    });
  });

  it('the live text of every step also keeps to it', () => {
    STAGES.forEach((st, i) => {
      let s: LabState = { ...INITIAL };
      s = reducer(s, { type: 'goto', stage: i, stages: STAGES });
      st.views.forEach((v, vi) => {
        const c = computeCur(ctx, st, { ...s, view: vi });
        const text = [...v.fn(ctx, c).legend, ...st.stats(ctx, c).flatMap((r) => [r.k, r.v]), st.worked(ctx, c)].join('\n');
        for (const [word, first] of INTRODUCED) {
          if (i + 1 < first) {
            const hit = text.match(word);
            expect(hit, `step ${i + 1} view ${v.label} uses "${hit?.[0]}", introduced at step ${first}`).toBeNull();
          }
        }
      });
    });
  });
});

describe('excluded metrics', () => {
  it('never appear in the copy, the math or the code of any step', () => {
    STAGES.forEach((_, i) => expect(words(i), TITLES[i]).not.toMatch(EXCLUDED));
  });
});

describe('equations', () => {
  it('every symbol and equation is valid TeX that KaTeX renders', () => {
    for (const st of STAGES) {
      for (const n of st.notation) {
        expect(() => katex.renderToString(n.s, { throwOnError: true }), `${st.title}: ${n.s}`).not.toThrow();
      }
      for (const m of st.math) {
        const html = katex.renderToString(m.tex, { displayMode: true, throwOnError: true });
        expect(html, `${st.title}: ${m.tex}`).toContain('katex');
      }
    }
  });
});

describe('code', () => {
  it('every code block named by a step exists in the Python source', () => {
    for (const st of STAGES) {
      for (const b of st.code) {
        expect(() => lab(b.name), `${st.title}: ${b.name}`).not.toThrow();
        expect(b.lines.length).toBeGreaterThan(1);
        expect(b.file).toMatch(/^training\/[a-z_]+\.py$/);
      }
    }
  });

  it('every explanation key is the exact text of a line in its block', () => {
    const byName = new Map(allBlocks().map((b) => [b.name, b]));
    for (const [name, notes] of Object.entries(EXPLANATIONS)) {
      const block = byName.get(name);
      expect(block, `explanations for "${name}" but no such block`).toBeDefined();
      for (const key of Object.keys(notes)) {
        expect(block!.lines, `${name}: no line is exactly ${JSON.stringify(key)}`).toContain(key);
      }
    }
  });

  it('every block a step shows has explanations, and unexplained lines are blank', () => {
    for (const st of STAGES) {
      for (const b of st.code) {
        const rows = codeRows(b, EXPLANATIONS[b.name]);
        expect(rows.length, b.name).toBeGreaterThan(1);
        expect(rows.filter((r) => r.note !== '').length, `${b.name} has explained lines`).toBeGreaterThan(1);
        for (const r of rows) {
          if (!(r.code in (EXPLANATIONS[b.name] ?? {}))) expect(r.note, `${b.name}: ${r.code}`).toBe('');
        }
      }
    }
  });

  it('squeezes runs of blank lines and drops blank edges', () => {
    const rows = codeRows({ name: 'x', file: 'training/x.py', startLine: 1, lines: ['', 'a', '', '', 'b', ''] }, { a: 'first' });
    expect(rows).toEqual([{ code: 'a', note: 'first' }, { code: '', note: '' }, { code: 'b', note: '' }]);
  });
});
