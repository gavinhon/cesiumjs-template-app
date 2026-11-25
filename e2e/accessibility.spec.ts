import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, isPhone, openApp, openToolbarPanel, test } from './fixtures';

async function violations(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    // Cesium's own widget DOM is third-party.
    .exclude('.cesium-viewer-bottom')
    .exclude('.cesium-widget-credits')
    .analyze();
  return violations.map(({ id, help, nodes }) => ({
    id,
    help,
    targets: nodes.map((node) => node.target.join(' ')),
  }));
}

test('the map view has no WCAG A/AA violations', async ({ page }) => {
  await openApp(page);
  expect(await violations(page)).toEqual([]);
});

test('the Add data panel has no WCAG A/AA violations', async ({ page }) => {
  await openApp(page);
  await openToolbarPanel(page, 'Add data');
  await expect(page.locator('#add-data-panel')).toHaveAttribute('aria-hidden', 'false');
  expect(await violations(page)).toEqual([]);
});

test('every control can be reached with the keyboard', async ({ page }) => {
  await openApp(page);
  const visited = new Set<string>();
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    const name = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return el?.getAttribute('aria-label') ?? el?.textContent?.trim() ?? '';
    });
    visited.add(name);
  }
  const expected = isPhone(page)
    ? ['Menu', 'Layers', 'Reset to north', '2D']
    : ['Add data', 'On the map', 'Reset to north', '2D'];
  for (const control of expected) {
    expect([...visited], `Tab reaches ${control}`).toContainEqual(
      expect.stringMatching(`^${control}`),
    );
  }
});
