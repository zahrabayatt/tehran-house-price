import { expect, test } from '@playwright/test';

const ROUTES = [
  { hash: '#/', heading: 'What would this Tehran apartment be advertised for?', nav: 'Estimate' },
  { hash: '#/lab', heading: 'Model Lab', nav: 'Model Lab' },
  { hash: '#/data', heading: 'Where the numbers come from', nav: 'Data' },
];

for (const r of ROUTES) {
  test(`route ${r.hash} shows its heading`, async ({ page }) => {
    await page.goto(r.hash);
    await expect(page.getByRole('heading', { level: 1, name: r.heading })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: r.nav })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
}

test('pill navigation moves between routes', async ({ page }) => {
  await page.goto('#/');
  const nav = page.getByRole('navigation', { name: 'Main' });
  await nav.getByRole('link', { name: 'Model Lab' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Model Lab' })).toBeVisible();
  await nav.getByRole('link', { name: 'Data' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Where the numbers come from' })).toBeVisible();
});

test('theme button switches and survives a reload', async ({ page }) => {
  await page.goto('#/');
  const app = page.locator('.app');
  await expect(app).not.toHaveClass(/dark/);
  await page.getByRole('button', { name: 'Asphalt' }).click();
  await expect(app).toHaveClass(/dark/);
  await expect(page.getByRole('button', { name: 'Light' })).toBeVisible();
  await page.reload();
  await expect(page.locator('.app')).toHaveClass(/dark/);
  await page.getByRole('button', { name: 'Light' }).click();
  await expect(page.locator('.app')).not.toHaveClass(/dark/);
});

test('footer names the author and hides empty links', async ({ page }) => {
  await page.goto('#/');
  const footer = page.getByRole('contentinfo');
  await expect(footer).toContainText('Built by Zahra Bayat.');
  await expect(footer.getByRole('link')).toHaveCount(0);
});

test('fonts are self-hosted', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (req) => {
    if (!req.url().startsWith('http://127.0.0.1')) external.push(req.url());
  });
  await page.goto('#/');
  await page.waitForLoadState('networkidle');
  expect(external).toEqual([]);
});
