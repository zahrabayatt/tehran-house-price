import { expect, test, type Page } from '@playwright/test';

const estimate = (page: Page) => page.getByTestId('estimate');
const hoodInput = (page: Page) => page.getByLabel('Neighborhood', { exact: true });
const EXCLUDED = /\b(MSE|RMSE|L1|L2|Accuracy|Precision|Recall|F1|ROC-AUC)\b/i;

test.beforeEach(async ({ page }) => {
  await page.goto('#/');
  await expect(estimate(page)).toBeVisible();
});

test('opens on Saadat Abad and 85 m² with a dated, one-decimal estimate', async ({ page }) => {
  await expect(hoodInput(page)).toHaveValue('Saadat Abad');
  await expect(page.locator('#area')).toHaveValue('85');
  await expect(estimate(page)).toHaveText(/^\d+\.\dbillion toman$/);
  await expect(page.getByText('December 2024 price')).toBeVisible();
  await expect(page.getByText('Tehran asking prices are about 3 times higher today. This estimate is not adjusted.')).toBeVisible();
});

test('shows the range similar ads asked then, and where it comes from', async ({ page }) => {
  await expect(page.getByTestId('similar')).toHaveText(/^Similar ads then: \d+\.\d to \d+\.\d billion$/);
  await expect(page.locator('.est-src')).toContainText('in Saadat Abad, November and December 2024');
});

test('changing the area changes the estimate', async ({ page }) => {
  const before = await estimate(page).innerText();
  await page.locator('#area').fill('140');
  await expect(estimate(page)).not.toHaveText(before);
});

test('typing an official name selects it everywhere, and the form keeps its height', async ({ page }) => {
  const before = await estimate(page).innerText();
  const form = page.locator('.est-form');
  const h0 = (await form.boundingBox())!.height;
  await hoodInput(page).fill('Ghalamestan - Baradaran Javadian');
  await expect(page.getByTestId('map-caption')).toContainText('Ghalamestan - Baradaran Javadian:');
  await expect(estimate(page)).not.toHaveText(before);
  expect(Math.abs((await form.boundingBox())!.height - h0)).toBeLessThan(1);
  await hoodInput(page).fill('Nowhere Land');
  await expect(page.locator('#hood-note')).toHaveText('No match. Pick from the list or the map.');
});

test('clicking the map selects a neighborhood', async ({ page }) => {
  const map = page.locator('.hood-map[data-ready="true"]');
  await expect(map).toBeAttached({ timeout: 30_000 });
  await map.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500); // let the tiles and neighborhoods finish drawing
  const box = (await page.locator('.hood-map').boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.45);
  await expect(hoodInput(page)).not.toHaveValue('Saadat Abad');
  const name = await hoodInput(page).inputValue();
  await expect(page.getByTestId('map-caption')).toContainText(`${name}:`);
});

test('an invalid year shows help text and a valid one clears it', async ({ page }) => {
  const help = page.locator('#year-help');
  await expect(help).toHaveText('Solar Hijri year, 1370 to 1403');
  await page.getByLabel('Year built').fill('1500');
  await expect(help).toHaveText('Enter a Solar Hijri year from 1370 to 1403. Using 1403 for now.');
  await page.getByLabel('Year built').fill('1390');
  await expect(help).toHaveText('Solar Hijri year, 1370 to 1403');
});

test('an area above 200 m² says the estimate is less reliable', async ({ page }) => {
  const note = page.getByText('Few apartments this large were in the data');
  await expect(note).toHaveCount(0);
  await page.locator('#area').fill('230');
  await expect(note).toBeVisible();
});

test('links to the Lab and the Data page, and names no evaluation metric', async ({ page }) => {
  await expect(page.getByRole('link', { name: 'How was this calculated?' })).toHaveAttribute('href', '#/lab');
  await expect(page.getByRole('link', { name: 'How close is the model?' })).toHaveAttribute('href', '#/data');
  expect(await page.locator('main').innerText()).not.toMatch(EXCLUDED);
});
