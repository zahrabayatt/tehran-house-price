import { expect, test, type Page } from '@playwright/test';
import { GITHUB_URL } from '../src/config';

const TITLES = [
  'Data and notation', 'Cleaning', 'The model', 'Cost function', 'Gradient', 'Gradient descent', 'Vectorization',
  'Multiple features', 'Learning rate', 'Feature scaling', 'Feature engineering', 'Overfitting', 'Regularization',
  'Log price', 'Held-out result',
];
const EXCLUDED = /\b(MSE|RMSE|L1|L2|Accuracy|Precision|Recall|F1|ROC-AUC)\b/i;

/** Open a step and wait until its data is in and the skeleton is gone. */
async function open(page: Page, n: number) {
  await page.goto(`#/lab/${n}`);
  await expect(page.locator('#main:not(.skel)')).toBeAttached({ timeout: 30_000 });
}

for (let n = 1; n <= TITLES.length; n++) {
  test(`step ${n} loads with no page errors, real code and no excluded metric`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await open(page, n);
    await expect(page.getByRole('heading', { level: 2, name: TITLES[n - 1] })).toBeVisible();
    await expect(page.getByText(`Step ${n} of 15`)).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Steps' }).getByRole('link', { name: `${n} ${TITLES[n - 1]}`, exact: true }))
      .toHaveAttribute('aria-current', 'page');
    const link = page.locator('.code-block__file a').first();
    await expect(link).toHaveAttribute('href', new RegExp(`^${GITHUB_URL}/blob/`));
    expect(await page.locator('.lab').innerText()).not.toMatch(EXCLUDED);
    expect(errors).toEqual([]);
  });
}

test('the step list has three sections and next and previous move between steps', async ({ page }) => {
  await open(page, 1);
  const nav = page.getByRole('navigation', { name: 'Steps' });
  await expect(nav.getByText('Fitting well')).toBeVisible();
  await expect(nav.getByRole('link')).toHaveCount(15);
  await page.getByRole('link', { name: 'Next: Cleaning →' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Cleaning' })).toBeVisible();
  await page.getByRole('link', { name: '← Data and notation' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Data and notation' })).toBeVisible();
});

test('switching the code and math tabs never changes the page height', async ({ page }) => {
  await open(page, 4);
  const h = () => page.evaluate(() => document.documentElement.scrollHeight);
  const before = await h();
  await page.getByRole('tab', { name: 'The math' }).click();
  expect(await h()).toBe(before);
});

test('a scikit-learn tab appears only where there is a real equivalent', async ({ page }) => {
  await open(page, 6);
  await expect(page.getByRole('tab', { name: 'scikit-learn' })).toHaveCount(0);
  await open(page, 10);
  await expect(page.getByRole('tab', { name: 'scikit-learn' })).toBeVisible();
});

test('step 1 uses every training ad', async ({ page }) => {
  await open(page, 1);
  await expect(page.getByText('All 48,332 training ads')).toBeVisible();
});

test('step 2 reproduces the real cleaning: 81,603 kept', async ({ page }) => {
  await open(page, 2);
  await expect(page.locator('.lab')).toContainText('81,603');
});

test('step 6 trains when play is pressed', async ({ page }) => {
  await open(page, 6);
  await page.getByRole('button', { name: /Start/ }).first().click();
  await expect(page.locator('#sk')).not.toHaveText('0', { timeout: 10_000 });
});

test('step 12: degree 9 on 10 ads overfits', async ({ page }) => {
  await open(page, 12);
  await page.locator('#deg').fill('9');
  await expect(page.locator('#verdict')).toHaveText('Overfit');
});

test('step 14: the log ruler costs the same share of miss the same at any price', async ({ page }) => {
  await open(page, 14);
  const logCost = page.locator('#three .num').nth(2).locator('b');
  const before = await logCost.innerText();
  await expect(page.locator('#rv2')).toContainText('0.182 and 0.182');
  await page.locator('#price').fill('30');
  await expect(page.locator('#rv1')).toContainText('0.80 and 6.00');
  await expect(page.locator('#pv')).toHaveText('30.0 billion');
  await expect(logCost).toHaveText(before);
  await expect(page.locator('#threeNote')).toContainText('times as much');
  // the October comparison from lab-logprice.json, with log price and log inputs winning
  await expect(page.locator('#cmp .cm')).toHaveCount(3);
  await expect(page.locator('#cmp .cm.win')).toContainText('Log price and log inputs');
});

test('step 15 shows the held-out cost and version 1 from the model file', async ({ page }) => {
  await open(page, 15);
  await expect(page.locator('#three')).toContainText('0.0496');
  await expect(page.locator('#v1')).toContainText('12.1%');
  await expect(page.locator('#v1')).toContainText('version 1: 58.5%');
});

test('step 2: dragging a limit line moves it and recounts the ads', async ({ page }) => {
  await open(page, 2);
  const handle = page.getByRole('slider', { name: 'Largest area' });
  await handle.scrollIntoViewIfNeeded();
  const box = (await handle.locator('circle').boundingBox())!;
  const kept = await page.locator('.lab').innerText();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  // slowly, like a person: the chart redraws between moves
  for (let i = 1; i <= 5; i++) {
    await page.mouse.move(box.x - i * 12, box.y + box.height / 2);
    await page.waitForTimeout(60);
  }
  await page.mouse.up();
  await expect(handle).not.toHaveAttribute('aria-valuenow', '600');
  // the line followed the mouse all the way, not just the first move
  const end = (await page.getByRole('slider', { name: 'Largest area' }).locator('circle').boundingBox())!;
  expect(Math.abs(end.x + end.width / 2 - (box.x - 60))).toBeLessThan(8);
  expect(await page.locator('.lab').innerText()).not.toBe(kept);
});

test('the model line is drawn in steps 3, 4 and 6, above the dots', async ({ page }) => {
  for (const n of [3, 4, 6, 11]) {
    await open(page, n);
    const svg = page.locator('.pbox svg').first();
    expect(await svg.evaluate((s) => getComputedStyle(s).position)).toBe('relative');
    if (n === 11) continue;
    const stroke = await page.locator('[stroke="var(--line)"]').first().evaluate((l) => getComputedStyle(l).stroke);
    expect(stroke).not.toBe('none');
  }
});
