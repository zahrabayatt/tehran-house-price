import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const ROUTES = [
  { name: 'Estimate', hash: '#/', heading: 'What was this apartment advertised for in late 2024?' },
  { name: 'Data', hash: '#/data', heading: 'The data behind the estimate' },
  { name: 'Model Lab', hash: '#/lab', heading: 'Model Lab' },
];
const WIDTHS = [1280, 390];
const THEMES = ['dark', 'light'] as const;

/** Open a route in a theme and wait until the content, not a loading message, is on screen. */
async function open(page: Page, hash: string, heading: string, theme: (typeof THEMES)[number]) {
  await page.addInitScript((t) => localStorage.setItem('thp-theme', t), theme);
  await page.goto(hash);
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
  await expect(page.locator('p.notice[role="status"]')).toHaveCount(0);
  if (hash.startsWith('#/lab')) await expect(page.locator('#main:not(.skel)')).toBeAttached({ timeout: 30_000 });
  await page.waitForLoadState('networkidle');
}

/** Serious problems, leaving out the street map's own canvas and controls (MapLibre, not this site). */
async function serious(page: Page) {
  const results = await new AxeBuilder({ page }).exclude('.maplibregl-canvas-container').exclude('.maplibregl-ctrl').analyze();
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
}

const sideScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);

for (const route of ROUTES) {
  for (const theme of THEMES) {
    for (const width of WIDTHS) {
      test(`${route.name}, ${theme}, ${width}px: no serious accessibility problems and no sideways scroll`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await open(page, route.hash, route.heading, theme);
        expect(await serious(page)).toEqual([]);
        expect(await sideScroll(page)).toBe(false);
      });
    }
  }
}

// Every Lab step is different, so each one is checked, with each of its tabs.
for (const theme of THEMES) {
  for (const width of WIDTHS) {
    test(`Model Lab, ${theme}, ${width}px: every step and tab`, async ({ page }) => {
      test.setTimeout(300_000);
      await page.setViewportSize({ width, height: 900 });
      const problems: string[] = [];
      for (let step = 1; step <= 15; step++) {
        await open(page, `#/lab/${step}`, 'Model Lab', theme);
        const tabs = await page.getByRole('tab').allInnerTexts();
        for (const tab of tabs) {
          await page.getByRole('tab', { name: tab }).click();
          for (const p of await serious(page)) problems.push(`step ${step}, ${tab}: ${p}`);
          if (await sideScroll(page)) problems.push(`step ${step}, ${tab}: page scrolls sideways`);
        }
      }
      expect(problems).toEqual([]);
    });
  }
}
