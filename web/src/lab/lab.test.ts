import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createScope, leastSquares, seededPick } from './data';
import { EXPLANATIONS } from './explanations';
import { allBlocks } from './snippets';
import { STEPS } from './steps';
import type { TrainFile } from './data';

const train = JSON.parse(readFileSync(resolve(__dirname, '../../public/data/lab-train.json'), 'utf8')) as TrainFile;

describe('the Lab steps', () => {
  it('has fifteen steps in order, in three sections', () => {
    expect(STEPS.map((s) => s.n)).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
    expect(new Set(STEPS.map((s) => s.section))).toEqual(new Set(['One feature', 'Many features', 'Fitting well']));
  });

  it('shows real training code for every step', () => {
    for (const s of STEPS) {
      const blocks = s.code();
      expect(blocks.length).toBeGreaterThan(0);
      for (const b of blocks) expect(b.file).toMatch(/^training\/[a-z_]+\.py$/);
    }
  });

  it('has no explanation left on a line that is not in the code', () => {
    const byName = Object.fromEntries(allBlocks().map((b) => [b.name, b]));
    for (const [name, lines] of Object.entries(EXPLANATIONS)) {
      if (!byName[name]) continue; // explanations of blocks no step shows are kept for reuse
      for (const line of Object.keys(lines)) expect(byName[name].lines).toContain(line);
    }
  });

  it('every step module has markup and a mount function', async () => {
    for (const s of STEPS) {
      const mod = await s.load();
      expect(mod.html).toContain('id="main"');
      expect(typeof mod.mount).toBe('function');
      expect(mod.html).not.toMatch(/\b(MSE|RMSE|MAE|Accuracy)\b/);
    }
  });
});

describe('the Lab data', () => {
  it('uses every training ad', () => {
    expect(train.rows).toBe(48_332);
    expect(train.price).toHaveLength(train.rows);
  });

  it('finds the best line from step 4 by least squares: w 25.0 per 100 m², b −12.4', () => {
    const { w, b } = leastSquares([train.area.map((a) => a / 100)], train.price);
    expect(w[0]).toBeCloseTo(24.95, 1);
    expect(b).toBeCloseTo(-12.36, 1);
  });

  it('picks the same ads every time', () => {
    expect(seededPick(1000, 5, 7)).toEqual(seededPick(1000, 5, 7));
    expect(new Set(seededPick(1000, 40, 7)).size).toBe(40);
  });

  it('stops a step’s timers when it is left', async () => {
    const s = createScope();
    let ran = false;
    s.setTimeout(() => {
      ran = true;
    }, 0);
    s.dispose();
    await new Promise((r) => setTimeout(r, 10));
    expect(ran).toBe(false);
  });
});

describe('Lab colours', () => {
  it('every colour a step uses is defined somewhere', () => {
    const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');
    const steps = STEPS.map((s) => read(`steps/step${s.n}.js`)).join('\n') + read('bowl.js');
    const css = read('lab-steps.css') + read('../pages/lab.css') + read('../theme/tokens.css');
    const used = new Set([...(steps + css).matchAll(/var\(--([a-z0-9-]+)\)/g)].map((m) => m[1]));
    // --c is set inline by the step itself (style="--c:...")
    const defined = new Set([...css.matchAll(/--([a-z0-9-]+)\s*:/g), ...steps.matchAll(/--([a-z0-9-]+)\s*:/g)].map((m) => m[1]));
    expect([...used].filter((v) => !defined.has(v))).toEqual([]);
  });
});
