import { expect, test } from '@playwright/test';

import { expectAccessible, gotoApp, openMenu, swipe, tapItem } from './helpers';

/** Background of the app's root view (the first element under #root with a background). */
const appBackground = (page: import('@playwright/test').Page) =>
  page.evaluate(() => [...document.querySelectorAll('#root div')].map((e) => getComputedStyle(e).backgroundColor).find((c) => c !== 'rgba(0, 0, 0, 0)'));

const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

test.describe('design system', () => {
  test('light theme uses the spec colors and self-hosted fonts', async ({ page }) => {
    await gotoApp(page, '/read/jhn/3');
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe(rgb('#FFFAE1'));
    const verse = page.getByTestId('verse-1');
    const style = await verse.evaluate((el) => {
      const s = getComputedStyle(el.parentElement!);
      return { color: s.color, font: s.fontFamily };
    });
    expect(style.color).toBe(rgb('#1C1A17'));
    expect(style.font).toContain('Literata');
    const label = await page.getByTestId('version-kjv').evaluate((el) => getComputedStyle(el.querySelector('div')!).fontFamily);
    expect(label).toContain('Inter');
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.fonts.check('20px Literata'))).toBe(true);
    // Gold for the corner dots; never for text.
    const dot = await page.getByTestId('main-menu-hint-dot').evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(dot).toBe(rgb('#A87A22'));
  });

  test('dark theme follows the device setting', async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: 'dark' });
    const page = await context.newPage();
    await gotoApp(page, '/read/jhn/3');
    expect(await appBackground(page)).toBe(rgb('#14120F'));
    const color = await page.getByTestId('verse-1').evaluate((el) => getComputedStyle(el.parentElement!).color);
    expect(color).toBe(rgb('#FFFAE1'));
    const dot = await page.getByTestId('main-menu-hint-dot').evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(dot).toBe(rgb('#A87A22'));
    await expectAccessible(page, 'dark reader');
    await context.close();
  });

  test('reading is chrome-free: no header bar, only the two corner dots', async ({ page }) => {
    await gotoApp(page, '/read/jhn/3');
    await expect(page.locator('header, nav')).toHaveCount(0);
    await expect(page.getByTestId('main-menu-hint')).toBeVisible();
    await expect(page.getByTestId('tabs-menu-hint')).toBeVisible();
  });

  test('font size, dyslexia font, and high contrast change from the menu and reset each visit', async ({ page }) => {
    await gotoApp(page, '/read/jhn/3');
    const size = () => page.getByTestId('verse-1').evaluate((el) => parseFloat(getComputedStyle(el.parentElement!).fontSize));
    const before = await size();
    await swipe(page, 'main-menu', ['read', 'read.a11y', 'a11y.larger']);
    await expect.poll(size).toBeGreaterThan(before);
    await swipe(page, 'main-menu', ['read', 'read.a11y', 'a11y.dyslexia']);
    await expect.poll(() => page.getByTestId('verse-1').evaluate((el) => getComputedStyle(el.parentElement!).fontFamily)).toContain('Inter');
    await openMenu(page, 'main-menu');
    await tapItem(page, 'main-menu', 'read');
    await tapItem(page, 'main-menu', 'read.a11y');
    await tapItem(page, 'main-menu', 'a11y.contrast');
    await expect.poll(() => appBackground(page)).toBe('rgb(255, 255, 255)');
    await expectAccessible(page, 'high contrast');
    // Nothing is saved: a reload brings back the defaults.
    await page.reload();
    await page.getByTestId('verse-1').waitFor();
    expect(await size()).toBe(before);
    expect(await page.getByTestId('verse-1').evaluate((el) => getComputedStyle(el.parentElement!).fontFamily)).toContain('Literata');
    expect(await appBackground(page)).toBe(rgb('#FFFAE1'));
  });

  test('Resources › Light / dark switches the theme for this visit only', async ({ page }) => {
    await gotoApp(page, '/read/jhn/3');
    expect(await appBackground(page)).toBe(rgb('#FFFAE1'));
    await swipe(page, 'main-menu', ['resources', 'res.theme']);
    await expect.poll(() => appBackground(page)).toBe(rgb('#14120F'));
    // The page behind the app follows too.
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(rgb('#14120F'));
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
    expect(await page.getByTestId('verse-1').evaluate((el) => getComputedStyle(el.parentElement!).color)).toBe(rgb('#FFFAE1'));
    await expectAccessible(page, 'dark by choice');
    // And back.
    await openMenu(page, 'main-menu');
    await tapItem(page, 'main-menu', 'resources');
    await tapItem(page, 'main-menu', 'res.theme');
    await expect.poll(() => appBackground(page)).toBe(rgb('#FFFAE1'));
    // Nothing is saved: dark again, then a reload is back to the device setting.
    await swipe(page, 'main-menu', ['resources', 'res.theme']);
    await expect.poll(() => appBackground(page)).toBe(rgb('#14120F'));
    await page.reload();
    await page.getByTestId('verse-1').waitFor();
    expect(await appBackground(page)).toBe(rgb('#FFFAE1'));
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBeUndefined();
  });

  test('on a dark device, Light / dark switches to light; the list menu says which way it goes', async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: 'dark' });
    const page = await context.newPage();
    await gotoApp(page, '/read/jhn/3');
    expect(await appBackground(page)).toBe(rgb('#14120F'));
    await page.keyboard.press('m');
    await page.getByRole('button', { name: 'Resources, opens submenu' }).click();
    await page.getByRole('button', { name: 'Light / dark: switch to light' }).click();
    await expect.poll(() => appBackground(page)).toBe(rgb('#FFFAE1'));
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(rgb('#FFFAE1'));
    await page.keyboard.press('m');
    await page.getByRole('button', { name: 'Resources, opens submenu' }).click();
    await expect(page.getByRole('button', { name: 'Light / dark: switch to dark' })).toBeVisible();
    await context.close();
  });

  test('tabs last for the current visit only', async ({ page }) => {
    await gotoApp(page, '/read/jhn/3');
    await page.keyboard.press('n');
    await page.keyboard.press('n');
    await openMenu(page, 'tabs-menu');
    await expect(page.locator('[data-testid^="tabs-menu-item-t"]')).toHaveCount(3);
    await page.keyboard.press('Escape');
    await page.reload();
    await page.getByTestId('main-menu-hint').waitFor();
    await openMenu(page, 'tabs-menu');
    await expect(page.locator('[data-testid^="tabs-menu-item-t"]')).toHaveCount(1);
  });
});
