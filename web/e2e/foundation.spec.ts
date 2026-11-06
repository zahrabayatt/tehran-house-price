import { expect, test } from '@playwright/test';
import { GITHUB_URL, AIR_URL as SIBLING } from '../src/config';

const ROUTES = [
  { hash: '#/', heading: 'What was this apartment advertised for in late 2024?', nav: 'Estimate' },
  { hash: '#/data', heading: 'The data behind the estimate', nav: 'Data' },
  { hash: '#/lab', heading: 'Model Lab', nav: 'Model Lab' },
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

test('the navigation holds only pages, in the order Estimate, Data, Model Lab', async ({ page }) => {
  await page.goto('#/');
  const nav = page.getByRole('navigation', { name: 'Main' });
  await expect(nav.getByRole('link')).toHaveText(['Estimate', 'Data', 'Model Lab']);
  await expect(nav.getByRole('button')).toHaveCount(0);
  await expect(page.getByText(/asphalt/i)).toHaveCount(0);
});

test('the site opens dark, and the theme button switches and survives a reload', async ({ page }) => {
  await page.goto('#/');
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await expect(html).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('footer names the author and links to the code and the other project', async ({ page }) => {
  await page.goto('#/data');
  const footer = page.getByRole('contentinfo');
  await expect(footer).toContainText('Built by Zahra Bayat.');
  const hrefs = await footer.getByRole('link').evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href));
  expect(hrefs.some((h) => h.startsWith(GITHUB_URL))).toBe(true);
  expect(hrefs.some((h) => h.startsWith(SIBLING))).toBe(true);
});

test('the only outside host the site loads from is the street map', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (req) => {
    const url = req.url();
    if (!url.startsWith('http://127.0.0.1') && !url.startsWith('data:') && !url.startsWith('blob:')) external.push(url);
  });
  for (const hash of ['#/', '#/data', '#/lab/4']) {
    await page.goto(hash);
    await page.waitForLoadState('networkidle');
  }
  expect(external.filter((u) => !u.startsWith('https://tiles.openfreemap.org/'))).toEqual([]);
});
