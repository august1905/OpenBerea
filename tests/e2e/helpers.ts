import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/** Fails on serious or critical axe violations. */
export async function expectAccessible(page: Page, context?: string) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const summary = serious.map((v) => `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join('\n  ')}`);
  expect(serious, `${context ?? page.url()}\n${summary.join('\n')}`).toEqual([]);
}

/** Opens a page and waits until the app has mounted (corner menus ready for input). */
export async function gotoApp(page: Page, url: string) {
  await page.goto(url);
  await page.getByTestId('main-menu-hint').waitFor();
  await page.waitForFunction(() => document.readyState === 'complete');
}

/** Center of an element, for pointer gestures. */
export async function center(page: Page, testId: string) {
  const box = await page.getByTestId(testId).boundingBox();
  if (!box) throw new Error(`No box for ${testId}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Press and hold the corner dot, swipe through the given items, and release on the last one. */
export async function swipe(page: Page, menu: 'main-menu' | 'tabs-menu', items: string[]) {
  const start = await center(page, `${menu}-hint`);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  let at = start;
  for (const id of items) {
    const target = await center(page, `${menu}-item-${id}`);
    const steps = 6;
    for (let i = 1; i <= steps; i++) {
      await page.mouse.move(at.x + ((target.x - at.x) * i) / steps, at.y + ((target.y - at.y) * i) / steps);
    }
    at = target;
  }
  await page.mouse.up();
}

/** Tap a menu item while the menu is open in click mode. */
export async function tapItem(page: Page, menu: 'main-menu' | 'tabs-menu', id: string) {
  const p = await center(page, `${menu}-item-${id}`);
  await page.mouse.click(p.x, p.y);
}

export async function openMenu(page: Page, menu: 'main-menu' | 'tabs-menu') {
  await page.getByTestId(`${menu}-hint`).click();
  await expect(page.getByTestId(`${menu}-overlay`)).toBeVisible();
}
