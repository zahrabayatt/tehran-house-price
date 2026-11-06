import { expect, test, type Page } from '@playwright/test';
import { GITHUB_URL } from '../src/config';

const TITLES = [
  'Data and notation', 'Cleaning', 'The model', 'Cost function', 'Gradient', 'Gradient descent', 'Vectorization',
  'Multiple features', 'Learning rate', 'Feature scaling', 'Feature engineering', 'Overfitting', 'Regularization',
  'Held-out result',
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
    await expect(page.getByText(`Step ${n} of 14`)).toBeVisible();
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
  await expect(nav.getByRole('link')).toHaveCount(14);
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

test('step 14 shows the held-out cost from the model file', async ({ page }) => {
  await open(page, 14);
  await expect(page.locator('#three')).toContainText('18.28');
});
