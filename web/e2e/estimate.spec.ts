import { expect, test, type Page } from '@playwright/test';

// The page fetches its data from the preview server. Several tests change one file on the way in.
const DATA = '**/data/';

async function editJson(page: Page, file: string, edit: (data: any) => void) {
  await page.route(`${DATA}${file}`, async (route) => {
    const res = await route.fetch();
    const data = await res.json();
    edit(data);
    await route.fulfill({ response: res, json: data });
  });
}

const estimate = (page: Page) => page.getByTestId('estimate');
const hoodInput = (page: Page) => page.getByLabel('Neighborhood', { exact: true });
const FALLBACK_NOTE = 'Not enough listings here, using the Tehran median';
const EXCLUDED = /\b(MSE|RMSE|L1|L2|Accuracy|Precision|Recall|F1|ROC-AUC)\b/i;

test.beforeEach(async ({ page }) => {
  await page.goto('#/');
  await expect(estimate(page)).toBeVisible();
});

test('opens on a real neighborhood and 85 m2 with a one-decimal estimate', async ({ page }) => {
  await expect(hoodInput(page)).toHaveValue('Saadat Abad');
  await expect(page.locator('#area')).toHaveValue('85');
  await expect(estimate(page)).toHaveText(/^≈ \d+\.\d$/);
});

test('changing the area changes the estimate', async ({ page }) => {
  const before = await estimate(page).innerText();
  await page.locator('#area').fill('140');
  await expect(estimate(page)).not.toHaveText(before);
});

test('clicking a hexagon changes the neighborhood', async ({ page }) => {
  const before = await estimate(page).innerText();
  await page.locator('path[data-neighborhood="zafaraniyeh"]').first().click();
  await expect(hoodInput(page)).toHaveValue('Zafaraniyeh');
  await expect(page.getByTestId('result-hood')).toHaveText('Zafaraniyeh');
  await expect(estimate(page)).not.toHaveText(before);
});

test('an invalid year shows help text and a valid one clears it', async ({ page }) => {
  const help = page.locator('#year-help');
  await expect(help).toHaveText('Solar Hijri year, 1370 to 1403');
  await page.getByLabel('Year built').fill('1500');
  await expect(help).toHaveText('Enter a Solar Hijri year from 1370 to 1403. Using 1403 for now.');
  await page.getByLabel('Year built').fill('1390');
  await expect(help).toHaveText('Solar Hijri year, 1370 to 1403');
});

test('an area above 200 shows the low-data note', async ({ page }) => {
  const note = page.getByText('Few listings this large were available');
  await expect(note).toHaveCount(0);
  await page.locator('#area').fill('230');
  await expect(note).toBeVisible();
  await page.locator('#area').fill('150');
  await expect(note).toHaveCount(0);
});

test('a failed model.json shows an error with a working retry', async ({ page }) => {
  await page.route(`${DATA}model.json`, (route) => route.fulfill({ status: 500, body: 'nope' }));
  await page.reload();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Could not load');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.unroute(`${DATA}model.json`);
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(estimate(page)).toBeVisible();
  await expect(alert).toHaveCount(0);
});

test('the market date comes from date_range.end', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Market as of December 2024' })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('March 2025');

  await editJson(page, 'model.json', (m) => {
    m.date_range = { start: '2024-05', end: '2025-02' };
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Market as of February 2025' })).toBeVisible();
});

test('a too-small apartment shows no price, no per-m2 figure, and keeps the breakdown', async ({ page }) => {
  await hoodInput(page).fill('Sharifabad');
  await page.locator('#area').fill('35');
  await page.getByLabel('Bedrooms').selectOption('0');
  await page.getByLabel('Year built').fill('1370');
  for (const name of ['Parking', 'Elevator', 'Storage']) await page.getByLabel(name, { exact: true }).uncheck();

  await expect(page.getByTestId('too-small')).toHaveText('Too small for this model to estimate');
  await expect(estimate(page)).toHaveCount(0);
  await expect(page.getByText('Per square meter')).toHaveCount(0);
  const result = page.getByTestId('result');
  await expect(result).not.toContainText(/[−-]\s?\d/);
  await expect(page.getByTestId('breakdown').getByText('Average apartment')).toBeVisible();
  await expect(page.getByTestId('breakdown').getByText('Size and neighborhood')).toBeVisible();

  // Back to a normal apartment: the number returns.
  await hoodInput(page).fill('Saadat Abad');
  await page.locator('#area').fill('85');
  await expect(estimate(page)).toBeVisible();
  await expect(page.getByText('Per square meter')).toBeVisible();
});

test('an unknown neighborhood falls back to the Tehran median with a note', async ({ page }) => {
  await expect(page.getByText(FALLBACK_NOTE)).toHaveCount(0);
  await hoodInput(page).fill('Nowhere Land');
  await expect(page.getByText(FALLBACK_NOTE)).toBeVisible();
  await expect(page.getByTestId('result-hood')).toHaveText('Tehran median');
  await expect(estimate(page)).toBeVisible();
  await expect(page.getByTestId('marker')).toHaveCount(0);

  await hoodInput(page).fill('Niavaran');
  await expect(page.getByText(FALLBACK_NOTE)).toHaveCount(0);
  await expect(page.getByTestId('result-hood')).toHaveText('Niavaran');
});

test('a hexagon whose neighborhood is not in the list uses the same note', async ({ page }) => {
  const hex = page.locator('path[data-neighborhood="ferdowsi"]').first();
  await hex.click();
  await expect(page.getByText(FALLBACK_NOTE)).toBeVisible();
  await expect(page.getByTestId('result-hood')).toHaveText('Tehran median');
  await expect(estimate(page)).toBeVisible();
  // It has a hexagon, so the marker sits on it.
  await expect(page.getByTestId('marker')).toHaveCount(1);
});

test('the marker sits on the hexagon center, and is absent without a hexagon', async ({ page }) => {
  const marker = page.getByTestId('marker');
  await expect(marker).toHaveCount(1);

  const hex = page.locator('path[data-neighborhood="niavaran"]').first();
  await hex.click();
  const hb = (await hex.boundingBox())!;
  const mb = (await marker.boundingBox())!;
  expect(Math.abs(hb.x + hb.width / 2 - (mb.x + mb.width / 2))).toBeLessThan(1.5);
  expect(Math.abs(hb.y + hb.height / 2 - (mb.y + mb.height / 2))).toBeLessThan(1.5);

  // Abbas Abad is a real neighborhood with no hexagon.
  await expect(page.locator('path[data-neighborhood="abbas-abad"]')).toHaveCount(0);
  await hoodInput(page).fill('Abbas Abad');
  await expect(page.getByTestId('result-hood')).toHaveText('Abbas Abad');
  await expect(marker).toHaveCount(0);
  await expect(page.getByText(FALLBACK_NOTE)).toHaveCount(0);
});

test('the breakdown starts at the average apartment, shows two decimals and real signs', async ({ page }) => {
  const rows = page.getByTestId('breakdown').locator('[data-row]');
  await expect(rows.first()).toContainText('Average apartment');
  await expect(rows.first()).toContainText(/\d+\.\d\d$/);
  const texts = await rows.allInnerTexts();
  expect(texts.length).toBeGreaterThanOrEqual(6);
  for (const t of texts.slice(1)) expect(t).toMatch(/^.+\s[+−]\d+\.\d\d$/s);
  await expect(page.getByRole('main')).toContainText(
    'These numbers describe patterns in the ads, not causes. For example, an elevator may look negative because of the other features it comes with.',
  );
});

test('the listings table shows 4 at a time and the button shows others', async ({ page }) => {
  const rows = page.locator('#check tbody tr');
  await expect(rows).toHaveCount(4);
  const first = await rows.allInnerTexts();
  await page.getByRole('button', { name: 'Show other listings' }).click();
  await expect(rows).toHaveCount(4);
  expect(await rows.allInnerTexts()).not.toEqual(first);
  await expect(page.locator('#check')).toContainText(
    /On listings it never trained on, the model was typically off by about \d+\.\d billion toman \(\d+\.\d% of the price\)\./,
  );
});

test('a negative model value in the data is shown as Below 0', async ({ page }) => {
  await editJson(page, 'listings.json', (rows) => {
    rows[0].model = -1.14;
    rows[0].difference = -1.14 - rows[0].asked;
  });
  await page.reload();
  await expect(page.locator('#check tbody tr').first()).toContainText('Below 0');
  await expect(page.locator('#check tbody')).not.toContainText('-1.14');
  await expect(page.locator('#check tbody')).not.toContainText('−1.14');
});

test('the project summary is honest and the GitHub link is hidden while unset', async ({ page }) => {
  const about = page.getByRole('region', { name: 'About this project' });
  await expect(about).toContainText('81,603 Tehran apartment listings');
  await expect(about).toContainText(
    'A simple rule, area times the neighborhood median, did slightly better on a typical listing. The model was chosen for its lower overall cost.',
  );
  await expect(about.getByRole('link', { name: 'See how it works' })).toHaveAttribute('href', /#\/lab$/);
  await expect(about.getByRole('link', { name: 'GitHub' })).toHaveCount(0);
});

test('no metric jargon appears on the page', async ({ page }) => {
  const text = await page.locator('main').innerText();
  expect(text).not.toMatch(EXCLUDED);
});

test('on a narrow screen the estimate comes before the form', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const result = (await page.getByTestId('result').boundingBox())!;
  const form = (await page.getByRole('form', { name: 'The apartment' }).boundingBox())!;
  expect(result.y).toBeLessThan(form.y);
  // No sideways scrolling.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('on a wide screen the form comes first', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const result = (await page.getByTestId('result').boundingBox())!;
  const form = (await page.getByRole('form', { name: 'The apartment' }).boundingBox())!;
  expect(form.x).toBeLessThan(result.x);
});

test('loading shows a status, not a blank page', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  await page.route(`${DATA}model.json`, async (route) => {
    await gate;
    await route.continue();
  });
  await page.reload();
  await expect(page.getByRole('status').filter({ hasText: 'Loading' })).toBeVisible();
  release();
  await expect(estimate(page)).toBeVisible();
});
