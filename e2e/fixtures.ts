import { test as base, expect, type Page } from '@playwright/test';

export { expect };

export const test = base.extend<{ pageErrors: Error[] }>({
  pageErrors: [
    async ({ page }, use) => {
      const errors: Error[] = [];
      page.on('pageerror', (error) => errors.push(error));
      // Keep runs hermetic: basemap tiles and remote services are not under test.
      await page.route(/^https?:\/\/(?!localhost[:/])/, (route) => route.abort());
      await use(errors);
      expect(errors, 'uncaught errors in the page').toEqual([]);
    },
    { auto: true },
  ],
});

export async function openApp(page: Page, hash = '') {
  await page.goto(hash ? `./#${hash}` : './');
  await expect(page.locator('.cesium-widget canvas')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Copy a link to this view/ })).toBeEnabled();
}

export function isPhone(page: Page): boolean {
  return (page.viewportSize()?.width ?? 1024) <= 640;
}

export async function openToolbarPanel(page: Page, name: 'Add data' | 'Drawings') {
  if (isPhone(page)) await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('button', { name, exact: true }).click();
}

export function cameraFromUrl(page: Page) {
  const camera = new URLSearchParams(new URL(page.url()).hash.slice(1)).get('camera');
  const [longitude, latitude, height] = (camera ?? '').split(',').map(Number);
  return { longitude, latitude, height };
}
