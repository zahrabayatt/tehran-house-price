import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const ROUTES = [
  { name: 'Estimate', hash: '#/', heading: 'What would this Tehran apartment be advertised for?' },
  { name: 'Model Lab', hash: '#/lab', heading: 'Model Lab' },
  { name: 'Data', hash: '#/data', heading: 'Where the numbers come from' },
];
const WIDTHS = [1280, 390];
const THEMES = ['light', 'asphalt'] as const;

/** Open a route and wait until the page content, not a loading message, is on screen. */
async function open(page: Page, hash: string, heading: string, theme: (typeof THEMES)[number]) {
  await page.goto(hash);
  if (theme === 'asphalt') {
    await page.getByRole('button', { name: 'Asphalt' }).click();
    await expect(page.locator('.app')).toHaveClass(/dark/);
  }
  await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
  // Data is fetched after the first paint on the Estimate page and the Lab.
  await expect(page.getByRole('status')).toHaveCount(0);
  await page.waitForLoadState('networkidle');
}

for (const route of ROUTES) {
  for (const theme of THEMES) {
    for (const width of WIDTHS) {
      test(`${route.name}, ${theme}, ${width}px: no serious or critical accessibility violations`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await open(page, route.hash, route.heading, theme);
        const results = await new AxeBuilder({ page }).analyze();
        const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
        const summary = serious.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
        expect(summary).toEqual([]);
      });
    }
  }
}

for (const route of ROUTES) {
  for (const theme of THEMES) {
    test(`${route.name}, ${theme}: no horizontal page scroll at 390px`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await open(page, route.hash, route.heading, theme);
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
    });
  }
}

// The Lab changes a lot from step to step and tab to tab (tables, code, equations, plots),
// so the first screen alone does not show whether every step passes.
const LAB_STEPS = 14;
const LAB_TABS = ['The math', 'The code', 'scikit-learn'];

for (const theme of THEMES) {
  for (const width of WIDTHS) {
    test(`Model Lab, ${theme}, ${width}px: every step and explanation tab has no serious or critical violations`, async ({ page }) => {
      test.setTimeout(240_000);
      await page.setViewportSize({ width, height: 900 });
      await open(page, '#/lab', 'Model Lab', theme);
      const problems: string[] = [];
      for (let step = 1; step <= LAB_STEPS; step++) {
        if (step > 1) {
          await page.getByRole('navigation', { name: 'Step navigation' }).getByRole('button', { name: /Next/ }).click();
        }
        for (const tab of LAB_TABS) {
          await page.getByRole('group', { name: 'Explanation section' }).getByRole('button', { name: tab }).click();
          const results = await new AxeBuilder({ page }).analyze();
          for (const v of results.violations) {
            if (v.impact === 'serious' || v.impact === 'critical') {
              problems.push(`step ${step}, ${tab}: ${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
            }
          }
          const { scrollWidth, clientWidth } = await page.evaluate(() => ({
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
          }));
          if (scrollWidth > clientWidth) problems.push(`step ${step}, ${tab}: page scrolls sideways`);
        }
      }
      expect(problems).toEqual([]);
    });
  }
}
