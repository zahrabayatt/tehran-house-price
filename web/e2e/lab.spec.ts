import { expect, test, type Locator, type Page } from '@playwright/test';

const TITLES = [
  'Data and notation',
  'Cleaning',
  'The model',
  'Cost function',
  'Gradient',
  'Gradient descent',
  'Vectorization',
  'Multiple features',
  'Learning rate',
  'Feature scaling',
  'Feature engineering',
  'Overfitting',
  'Regularization',
  'Held-out result',
];
/** Steps that show the training bar. Gradient descent is the first. */
const TRAINING = [6, 8, 9, 10];
const EXCLUDED = /\b(MSE|RMSE|L1|L2|Accuracy|Precision|Recall|F1|ROC-AUC)\b/i;
/** A word a step may use only from the step that introduces it. */
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

const steps = (page: Page) => page.getByRole('navigation', { name: 'Lab steps' });
const status = (page: Page) => page.getByTestId('step-status');
const plot = (page: Page) => page.getByTestId('plot').locator('svg');
const stats = (page: Page) => page.getByTestId('stats');
const runStatus = (page: Page) => page.getByTestId('run-status');
const tryNote = (page: Page) => page.getByTestId('try-note');
const stat = (page: Page, key: string) => stats(page).locator(`div:has(> dt:text-is("${key}")) > dd`);

/** The text of the whole page except the step list and the pager, whose titles name every step. */
async function pageText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const body = document.body.cloneNode(true) as HTMLElement;
    body.querySelectorAll('nav[aria-label="Lab steps"], nav[aria-label="Step navigation"], script, style').forEach((n) => n.remove());
    return body.textContent ?? '';
  });
}

async function goStep(page: Page, n: number) {
  await steps(page).getByRole('button', { name: TITLES[n - 1], exact: true }).click();
  await expect(page.getByRole('heading', { level: 2, name: TITLES[n - 1], exact: true })).toBeVisible();
}

/** Set a range or number input the way a user drag would: through the input event. */
async function setInput(input: Locator, value: number | string) {
  await input.evaluate((el, v) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    set.call(el, String(v));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

/** Every attribute of every element in the plot, to look for values that are not numbers. */
async function badPlotValues(page: Page): Promise<string[]> {
  return plot(page).evaluate((svg) => {
    const bad: string[] = [];
    for (const el of [svg, ...Array.from(svg.querySelectorAll('*'))]) {
      for (const a of Array.from(el.attributes)) {
        if (/NaN|Infinity|undefined|null/.test(a.value)) bad.push(`${el.tagName}[${a.name}]=${a.value.slice(0, 60)}`);
      }
      if (/NaN|Infinity|undefined/.test(el.textContent ?? '') && el.children.length === 0) {
        bad.push(`${el.tagName} text ${el.textContent}`);
      }
    }
    return bad;
  });
}
const drawn = (page: Page) => plot(page).locator('circle, path, rect, text').count();

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  return errors;
}

async function viewNames(page: Page): Promise<string[]> {
  return page.getByRole('group', { name: 'Plot view' }).getByRole('button').allInnerTexts();
}
async function triesCount(page: Page): Promise<number> {
  return page.getByRole('group', { name: 'Try this' }).getByRole('button').count();
}

test.beforeEach(async ({ page }) => {
  await page.goto('#/lab');
  await expect(page.getByRole('heading', { level: 1, name: 'Model Lab' })).toBeVisible();
  await expect(page.getByTestId('plot')).toBeVisible();
});

test('lists the 14 steps in design order under three parts', async ({ page }) => {
  const names = await steps(page).getByRole('button').evaluateAll((els) =>
    els.map((e) => (e.textContent ?? '').replace(/^\d+/, '')),
  );
  expect(names).toEqual(TITLES);
  for (const part of ['One feature', 'Many features', 'Generalizing']) {
    await expect(steps(page).getByText(part, { exact: true })).toBeAttached();
  }
});

test('opens at step 1 of 14', async ({ page }) => {
  await expect(status(page)).toContainText('Step 1 of 14');
  await expect(page.getByRole('heading', { level: 2 }).first()).toHaveText('Data and notation');
  await expect(steps(page).getByRole('button', { name: 'Data and notation', exact: true })).toHaveAttribute(
    'aria-current',
    'step',
  );
});

test('Next and Previous move one step at a time', async ({ page }) => {
  const pager = page.getByRole('navigation', { name: 'Step navigation' });
  await expect(pager.getByRole('button', { name: /Previous|←/ })).toHaveCount(0);
  await pager.getByRole('button', { name: 'Next: Cleaning →' }).click();
  await expect(status(page)).toContainText('Step 2 of 14');
  await expect(page.getByRole('heading', { level: 2 }).first()).toHaveText('Cleaning');
  await pager.getByRole('button', { name: '← Data and notation' }).click();
  await expect(status(page)).toContainText('Step 1 of 14');
  for (let i = 1; i < 14; i++) await pager.getByRole('button', { name: /^Next:/ }).click();
  await expect(status(page)).toContainText('Step 14 of 14');
  await expect(pager.getByRole('button', { name: /^Next:/ })).toHaveCount(0);
});

test('Start and the training bar exist only from step 6', async ({ page }) => {
  for (let n = 1; n <= 14; n++) {
    await goStep(page, n);
    const expected = TRAINING.includes(n) ? 1 : 0;
    await expect(page.getByRole('button', { name: 'Start', exact: true }), `step ${n}`).toHaveCount(expected);
    await expect(page.getByTestId('train-bar'), `step ${n}`).toHaveCount(expected);
    await expect(page.getByLabel('Iterations', { exact: true }), `step ${n}`).toHaveCount(expected);
  }
});

test('Start animates the cost and the run ends with a lower cost', async ({ page }) => {
  await goStep(page, 6);
  const before = (await stat(page, 'Cost J').innerText()).trim();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await expect.poll(async () => (await stat(page, 'Cost J').innerText()).trim()).not.toBe(before);
  const mid = Number(await stat(page, 'Cost J').innerText());
  await expect(runStatus(page)).toContainText(/^Ran on \d+ sample listings in [\d.]+ ms, measured in this browser/);
  const after = Number(await stat(page, 'Cost J').innerText());
  expect(after).toBeLessThan(Number(before));
  expect(after).toBeLessThanOrEqual(mid);
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible();
});

test('Pause, Resume, Step and Reset work', async ({ page }) => {
  await goStep(page, 6);
  await page.getByRole('button', { name: 'Step', exact: true }).click();
  await expect(page.getByText(/Replay: iteration 1 of/)).toBeVisible();
  await expect(page.getByTestId('run-status')).toHaveText('Paused at iteration 1 of 200.');
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeVisible();
  const paused = await page.getByTestId('replay-label').innerText();
  await page.waitForTimeout(300);
  expect(await page.getByTestId('replay-label').innerText()).toBe(paused);
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect(runStatus(page)).toContainText('Ran on');
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(runStatus(page)).toHaveText('Press Start to train with these settings.');
  await expect(page.getByText(/Replay: iteration 0 of/)).toBeVisible();
});

test('a large learning rate shows the divergence message and keeps the plots finite', async ({ page }) => {
  await goStep(page, 6);
  await setInput(page.getByLabel('Learning rate α'), 0.2);
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(runStatus(page)).toContainText(/Diverged at iteration \d+/);
  for (let v = 0; v < (await viewNames(page)).length; v++) {
    await page.getByRole('group', { name: 'Plot view' }).getByRole('button').nth(v).click();
    expect(await badPlotValues(page)).toEqual([]);
  }
});

test('the replay slider scrubs a finished run', async ({ page }) => {
  await goStep(page, 6);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(runStatus(page)).toContainText('Ran on');
  const end = (await stat(page, 'Cost J').innerText()).trim();
  await setInput(page.getByLabel(/^Replay: iteration/), 0);
  await expect(stat(page, 'Cost J')).not.toHaveText(end);
});

test('reduced motion jumps straight to the end', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await goStep(page, 6);
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(runStatus(page)).toContainText('Ran on');
  await expect(page.getByText(/Replay: iteration 200 of 200/)).toBeVisible();
});

test('the iterations box clamps to 1 through 5000', async ({ page }) => {
  await goStep(page, 6);
  const box = page.getByLabel('Iterations', { exact: true });
  await box.fill('99999');
  await box.blur();
  await expect(box).toHaveValue('5000');
  await box.fill('0');
  await box.blur();
  await expect(box).toHaveValue('1');
  await box.fill('37');
  await box.blur();
  await expect(page.getByText(/Replay: iteration 0 of 37/)).toBeVisible();
});

test('moving w or b clears the run', async ({ page }) => {
  await goStep(page, 6);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(runStatus(page)).toContainText('Ran on');
  await setInput(page.getByLabel('Weight w', { exact: true }), 12);
  await expect(runStatus(page)).toHaveText('Press Start to train with these settings.');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(runStatus(page)).toContainText('Ran on');
  await setInput(page.getByLabel('Bias b', { exact: true }), 5);
  await expect(runStatus(page)).toHaveText('Press Start to train with these settings.');
});

test('each plot tab switches the plot', async ({ page }) => {
  for (const n of [4, 6, 8, 14]) {
    await goStep(page, n);
    const names = await viewNames(page);
    expect(names.length).toBeGreaterThan(1);
    const labels = new Set<string | null>();
    for (let v = 0; v < names.length; v++) {
      const btn = page.getByRole('group', { name: 'Plot view' }).getByRole('button').nth(v);
      await btn.click();
      await expect(btn).toHaveAttribute('aria-pressed', 'true');
      await expect(plot(page)).toHaveAttribute('aria-label', `${TITLES[n - 1]}: ${names[v]}`);
      labels.add(await plot(page).getAttribute('aria-label'));
    }
    expect(labels.size).toBe(names.length);
  }
});

test('the worked example is live and follows the sliders', async ({ page }) => {
  await goStep(page, 3);
  const worked = page.getByTestId('worked');
  const before = await worked.innerText();
  expect(before).toMatch(/For the first listing:/);
  await setInput(page.getByLabel('Weight w', { exact: true }), 31);
  await expect(worked).not.toHaveText(before);
  expect(await worked.innerText()).toContain('31.00');
  const mid = await worked.innerText();
  await setInput(page.getByLabel('Bias b', { exact: true }), -22);
  await expect(worked).not.toHaveText(mid);
  expect(await worked.innerText()).toContain('-22.00');
});

test('stats panels show the live w, b and cost', async ({ page }) => {
  await goStep(page, 4);
  const cost = (await stat(page, 'Cost J').innerText()).trim();
  await setInput(page.getByLabel('Weight w', { exact: true }), 20);
  await expect(stat(page, 'w')).toHaveText('20.00');
  await expect(stat(page, 'Cost J')).not.toHaveText(cost);
});

test('equations render through KaTeX on every step', async ({ page }) => {
  for (let n = 1; n <= 14; n++) {
    await goStep(page, n);
    const math = page.getByTestId('math-tab');
    await expect(math, `step ${n}`).toBeVisible();
    expect(await math.locator('.katex').count(), `step ${n}`).toBeGreaterThan(0);
    expect(await math.locator('.katex-error').count(), `step ${n}`).toBe(0);
  }
});

test('the explanation tabs switch between math, code and scikit-learn', async ({ page }) => {
  await goStep(page, 3);
  const group = page.getByRole('group', { name: 'Explanation section' });
  await expect(page.getByTestId('math-tab')).toBeVisible();
  await group.getByRole('button', { name: 'The code' }).click();
  await expect(group.getByRole('button', { name: 'The code' })).toHaveAttribute('aria-pressed', 'true');
  const code = page.getByTestId('code-tab');
  await expect(code).toContainText('def predict_one(x, w, b):');
  await expect(code).toContainText('f_wb[i] = w * x[i] + b');
  await expect(code).toContainText('Exactly the equation above.');
  await expect(page.getByTestId('math-tab')).toHaveCount(0);
  await group.getByRole('button', { name: 'scikit-learn' }).click();
  await expect(page.getByTestId('sk-tab')).toContainText('LinearRegression');
});

test('code rows come from the repository, with the file named and no link without a repository URL', async ({ page }) => {
  await goStep(page, 13);
  await page.getByRole('button', { name: 'The code' }).click();
  const code = page.getByTestId('code-tab');
  await expect(code).toContainText('def compute_cost_reg(X, y, w, b, lambda_):');
  await expect(code).toContainText('training/model.py');
  await expect(code.getByRole('link')).toHaveCount(0);
});

test('every step and every plot view draws finite numbers', async ({ page }) => {
  test.setTimeout(240_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors = watchErrors(page);
  for (let n = 1; n <= 14; n++) {
    await goStep(page, n);
    const names = await viewNames(page);
    expect(names.length, `step ${n}`).toBeGreaterThan(0);
    for (let withRun = 0; withRun < (TRAINING.includes(n) ? 2 : 1); withRun++) {
      if (withRun) await page.getByRole('button', { name: 'Start', exact: true }).click();
      for (let v = 0; v < names.length; v++) {
        await page.getByRole('group', { name: 'Plot view' }).getByRole('button').nth(v).click();
        expect(await badPlotValues(page), `step ${n} view ${names[v]}`).toEqual([]);
        expect(await drawn(page), `step ${n} view ${names[v]} draws something`).toBeGreaterThan(3);
        const text = await stats(page).innerText();
        expect(text, `step ${n} stats`).not.toMatch(/NaN|Infinity|undefined/);
      }
    }
  }
  expect(errors).toEqual([]);
});

for (let n = 1; n <= 14; n++) {
  test(`step ${n} presets run without errors`, async ({ page }) => {
    test.setTimeout(120_000);
    const errors = watchErrors(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await goStep(page, n);
    const count = await triesCount(page);
    expect(count, `step ${n} has Try this presets`).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const btn = page.getByRole('group', { name: 'Try this' }).getByRole('button').nth(i);
      const label = (await btn.innerText()).trim();
      await btn.click();
      const note = (await tryNote(page).innerText()).trim();
      expect(note.length, `${label}: note`).toBeGreaterThan(20);
      expect(note, `${label}: note`).not.toMatch(/Pick one to see/);
      if (TRAINING.includes(n)) {
        await expect(runStatus(page), `${label}`).toContainText(/Ran on|Diverged|diverged/);
      }
      for (let v = 0; v < (await viewNames(page)).length; v++) {
        await page.getByRole('group', { name: 'Plot view' }).getByRole('button').nth(v).click();
        expect(await badPlotValues(page), `${label}`).toEqual([]);
      }
    }
    expect(errors).toEqual([]);
  });
}

test('the sandbox label is always visible', async ({ page }) => {
  for (const n of [1, 6, 10, 14]) {
    await goStep(page, n);
    await expect(page.getByTestId('sandbox-label')).toBeVisible();
    await expect(page.getByTestId('sandbox-label')).toContainText('Sandbox: does not affect the live model');
  }
});

test('the held-out step uses the shipped model for the real plots and labels the split slider as sandbox', async ({ page }) => {
  await goStep(page, 14);
  await expect(plot(page)).toHaveAttribute('aria-label', /Predicted vs actual/);
  await expect(page.getByTestId('plot')).toContainText('live model');
  await expect(page.getByLabel(/share of the sample used for training/i)).toHaveCount(0);
  await page.getByRole('group', { name: 'Plot view' }).getByRole('button', { name: 'Cost by degree' }).click();
  const slider = page.getByLabel(/share of the sample used for training/i);
  await expect(slider).toBeVisible();
  await expect(page.getByTestId('controls')).toContainText('Sandbox');
  const before = await stats(page).innerText();
  await setInput(slider, 50);
  await expect(stats(page)).not.toHaveText(before);
});

test('steps 1 to 13 show no held-out or training-run details anywhere on the page', async ({ page }) => {
  for (let n = 1; n <= 13; n++) {
    await goStep(page, n);
    for (let v = 0; v < (await viewNames(page)).length; v++) {
      await page.getByRole('group', { name: 'Plot view' }).getByRole('button').nth(v).click();
      const text = await pageText(page);
      expect(text, `step ${n}`).not.toMatch(/held-out|held out|test cost/i);
    }
    await expect(page.getByTestId('live-run')).toHaveCount(0);
    await expect(page.getByTestId('vs-sklearn')).toHaveCount(0);
    await expect(page.getByTestId('run-it')).toContainText('python -m training.train');
  }
});

test('the live training card shows measured values from model.json on the last step', async ({ page }) => {
  const model = await (await page.request.get('data/model.json')).json();
  await goStep(page, 14);
  const card = page.getByTestId('live-run');
  await expect(card).toContainText('Live model training run');
  const text = await card.innerText();
  expect(text).not.toContain('[measured]');
  expect(text).toContain(model.rows.train.toLocaleString('en-US'));
  expect(text).toContain(model.rows.held_out.toLocaleString('en-US'));
  expect(text).toContain(String(model.hyperparameters.iterations.toLocaleString('en-US')));
  expect(text).toContain(model.environment.numpy);
  const cmp = await page.getByTestId('vs-sklearn').innerText();
  expect(cmp).not.toContain('[measured]');
  expect(cmp).toContain(model.cost.held_out.toFixed(3));
  expect(cmp).toContain(model.sklearn_cost.linear_regression.toFixed(3));
  await expect(page.getByTestId('run-it')).toContainText('python -m training.train');
});

test('the vectorization step shows the timings stored in model.json', async ({ page }) => {
  const model = await (await page.request.get('data/model.json')).json();
  expect(model.vectorization.loop_ms).toBeGreaterThan(model.vectorization.numpy_ms);
  await goStep(page, 7);
  const numpy = await stat(page, 'NumPy, 1,000,000 numbers').innerText();
  const loop = await stat(page, 'Python loop, 1,000,000 numbers').innerText();
  expect(numpy).toMatch(/ms$/);
  expect(loop).toMatch(/ms$/);
  expect(Number.parseFloat(loop)).toBeGreaterThan(Number.parseFloat(numpy));
  expect(numpy + loop).not.toContain('[measured]');
});

test('no excluded metric name appears on any step', async ({ page }) => {
  for (let n = 1; n <= 14; n++) {
    await goStep(page, n);
    for (const tab of ['The math', 'The code', 'scikit-learn']) {
      await page.getByRole('group', { name: 'Explanation section' }).getByRole('button', { name: tab }).click();
      expect(await page.locator('main').innerText(), `step ${n} ${tab}`).not.toMatch(EXCLUDED);
    }
  }
});

test('no step uses a word before the step that introduces it', async ({ page }) => {
  test.setTimeout(240_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (let n = 1; n <= 14; n++) {
    await goStep(page, n);
    const seen: string[] = [];
    const read = async () => seen.push(await pageText(page));
    const views = (await viewNames(page)).length;
    for (let v = 0; v < views; v++) {
      await page.getByRole('group', { name: 'Plot view' }).getByRole('button').nth(v).click();
      await read();
    }
    for (const tab of ['The math', 'The code', 'scikit-learn']) {
      await page.getByRole('group', { name: 'Explanation section' }).getByRole('button', { name: tab }).click();
      await read();
    }
    const tries = await triesCount(page);
    for (let i = 0; i < tries; i++) {
      await page.getByRole('group', { name: 'Try this' }).getByRole('button').nth(i).click();
      await read();
    }
    const text = seen.join('\n');
    for (const [word, first] of INTRODUCED) {
      if (n < first) {
        const hit = text.match(word);
        expect(hit, `step ${n} uses "${hit?.[0]}" which step ${first} introduces`).toBeNull();
      }
    }
  }
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('the page does not scroll sideways and the step list scrolls on its own', async ({ page }) => {
    for (const n of [1, 4, 6, 8, 9, 10, 14]) {
      await goStep(page, n);
      for (const tab of ['The math', 'The code', 'scikit-learn']) {
        await page.getByRole('group', { name: 'Explanation section' }).getByRole('button', { name: tab }).click();
        const w = await page.evaluate(() => ({
          scroll: document.documentElement.scrollWidth,
          inner: window.innerWidth,
        }));
        expect(w.scroll, `step ${n} ${tab}`).toBeLessThanOrEqual(w.inner);
      }
    }
    const list = await steps(page).evaluate((el) => ({
      overflowX: getComputedStyle(el).overflowX,
      scrollW: el.scrollWidth,
      clientW: el.clientWidth,
      direction: getComputedStyle(el).flexDirection,
    }));
    expect(list.direction).toBe('row');
    expect(['auto', 'scroll']).toContain(list.overflowX);
    expect(list.scrollW).toBeGreaterThan(list.clientW);
  });
});

test.describe('on a narrow tablet', () => {
  test.use({ viewport: { width: 800, height: 900 } });

  test('the step list is one horizontally scrolling row without part headers', async ({ page }) => {
    const list = await steps(page).evaluate((el) => ({
      overflowX: getComputedStyle(el).overflowX,
      scrollW: el.scrollWidth,
      clientW: el.clientWidth,
      direction: getComputedStyle(el).flexDirection,
      tops: Array.from(el.querySelectorAll('button')).map((b) => Math.round(b.getBoundingClientRect().top)),
      heads: Array.from(el.querySelectorAll('.lab-steps__head')).map((h) => getComputedStyle(h).display),
    }));
    expect(list.direction).toBe('row');
    expect(['auto', 'scroll']).toContain(list.overflowX);
    expect(list.scrollW).toBeGreaterThan(list.clientW);
    expect(new Set(list.tops).size).toBe(1);
    expect(list.heads.length).toBeGreaterThan(0);
    expect(list.heads.every((d) => d === 'none')).toBe(true);
    const w = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
    expect(w.scroll).toBeLessThanOrEqual(w.inner);
  });
});
