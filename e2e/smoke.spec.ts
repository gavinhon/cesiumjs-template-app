import { cameraFromUrl, expect, isPhone, openApp, openToolbarPanel, test } from './fixtures';

test('loads the globe and its controls', async ({ page }) => {
  await openApp(page);
  const canvas = page.locator('.cesium-widget canvas');
  const box = await canvas.boundingBox();
  expect(box?.width).toBeGreaterThan(300);
  expect(box?.height).toBeGreaterThan(300);

  await expect(page.getByRole('combobox', { name: /Search places/ })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Map navigation' })).toBeVisible();
  // On a phone the basemap choice lives in the layer list instead.
  await expect(page.getByRole('button', { name: /^Basemap: / })).toBeVisible({
    visible: !isPhone(page),
  });
  await expect(page).toHaveURL(/#camera=/);
});

test('layer list starts open on desktop and closed on a phone', async ({ page }) => {
  await openApp(page);
  const toggle = isPhone(page)
    ? page.getByRole('button', { name: 'Layers', exact: true })
    : page.getByRole('button', { name: /^On the map/ });
  await expect(toggle).toHaveAttribute('aria-expanded', isPhone(page) ? 'false' : 'true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', isPhone(page) ? 'true' : 'false');
});

test('adds a catalogue dataset and lists it on the map', async ({ page }) => {
  await openApp(page);
  await openToolbarPanel(page, 'Add data');
  const panel = page.locator('#add-data-panel');
  await expect(panel.getByRole('heading', { name: 'Add data' })).toBeVisible();

  await panel.getByRole('searchbox', { name: 'Filter the catalogue' }).fill('af1');
  const add = panel.getByRole('button', { name: 'Add af1-gpt61sol' });
  await expect(add).toBeVisible();
  await expect(panel.getByRole('button', { name: /^Add Rail lines/ })).toHaveCount(0);

  await add.click();
  const layers = page.getByRole('complementary', { name: 'Layers on the map' });
  await expect(layers.getByRole('button', { name: 'Hide af1-gpt61sol' })).toBeVisible();
  await expect(page).toHaveURL(/layer=/);

  await layers.getByRole('button', { name: 'Hide af1-gpt61sol' }).click();
  await expect(layers.getByRole('button', { name: 'Show af1-gpt61sol' })).toBeVisible();
});

test('flies to a typed coordinate', async ({ page }) => {
  await openApp(page);
  const search = page.getByRole('combobox', { name: /Search places/ });
  await search.fill('1.2868, 103.8545');
  await expect(page.getByRole('option').first()).toContainText('1.2868');
  await search.press('Enter');

  await expect.poll(() => cameraFromUrl(page).height, { timeout: 20_000 }).toBeLessThan(20_000);
  expect(cameraFromUrl(page)).toMatchObject({
    latitude: expect.closeTo(1.2868, 1),
    longitude: expect.closeTo(103.8545, 1),
  });
});

test('restores a shared link', async ({ page }) => {
  await openApp(page, 'camera=103.851900,1.290300,5000.0,0.0,-90.0&mode=2d');
  await expect(page.getByRole('button', { name: '3D', exact: true })).toBeVisible();
  expect(cameraFromUrl(page)).toMatchObject({
    latitude: expect.closeTo(1.2903, 2),
    longitude: expect.closeTo(103.8519, 2),
  });

  await page.getByRole('button', { name: '3D', exact: true }).click();
  await expect(page.getByRole('button', { name: '2D', exact: true })).toBeVisible();
  await expect(page).not.toHaveURL(/mode=2d/);
});

test('copies a link to the current view', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'clipboard permission is Chromium-only');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openApp(page);
  await page.getByRole('button', { name: /^Copy a link to this view/ }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain('#camera=');
});

test('draws a line and lists it under Drawings', async ({ page }) => {
  await openApp(page, 'camera=103.851900,1.290300,3000.0,0.0,-90.0&mode=3d');
  await page.getByRole('button', { name: 'Draw', exact: true }).click();
  await page.getByRole('menuitemradio', { name: /^Line/ }).click();
  await expect(page.getByRole('status')).toBeVisible();

  const canvas = page.locator('.cesium-widget canvas');
  const box = (await canvas.boundingBox())!;
  const at = (fx: number, fy: number) => ({ x: box.width * fx, y: box.height * fy });
  await canvas.click({ position: at(0.4, 0.45) });
  await canvas.click({ position: at(0.6, 0.45) });
  await page.keyboard.press('Enter');

  await openToolbarPanel(page, 'Drawings');
  const drawings = page.locator('#drawings-panel');
  await expect(drawings).toHaveAttribute('aria-hidden', 'false');
  await expect(drawings.getByRole('listitem')).toHaveCount(1);
  await expect(drawings.getByRole('listitem')).toContainText(/Line 1.*LINE/);
});
