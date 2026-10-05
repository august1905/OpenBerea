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

type Menu = 'main-menu' | 'tabs-menu';

/** Touch-only screens (the phone project): the corner dots are hidden and edge swipes open the menus. */
export async function isTouchOnly(page: Page): Promise<boolean> {
  return page.evaluate(() => matchMedia('(hover: none)').matches);
}

type Touch = { x: number; y: number };

/** Raw touches (Chromium), for swipes; Playwright's touchscreen only taps. */
export async function touches(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', p?: Touch) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: p.x, y: p.y }] : [] });
  let at: Touch = { x: 0, y: 0 };
  return {
    async start(p: Touch) {
      at = p;
      await send('touchStart', p);
    },
    async move(p: Touch, steps = 6) {
      const from = at;
      for (let i = 1; i <= steps; i++) await send('touchMove', { x: from.x + ((p.x - from.x) * i) / steps, y: from.y + ((p.y - from.y) * i) / steps });
      at = p;
    },
    async end() {
      await send('touchEnd');
      await cdp.detach();
    },
  };
}

/**
 * Touch: swipe in from the menu's screen edge (right for the main menu, left for tabs), halfway up,
 * and keep the finger down. Returns the touch so the caller can carry on or lift it.
 */
export async function edgeSwipeOpen(page: Page, menu: Menu) {
  const vw = page.viewportSize()!;
  const right = menu === 'main-menu';
  const y = Math.round(vw.height / 2);
  const t = await touches(page);
  await t.start({ x: right ? vw.width - 6 : 6, y });
  await t.move({ x: right ? vw.width - 70 : 70, y: y - 6 });
  await expect(page.getByTestId(`${menu}-overlay`)).toBeVisible();
  return t;
}

/**
 * Choose an item in one gesture. Mouse: press and hold the corner dot, swipe through the given items,
 * and release on the last one. Touch: swipe in from the edge, slide through the items (resting on
 * each parent until its arc opens), rest on the last one a moment, and lift.
 */
export async function swipe(page: Page, menu: Menu, items: string[]) {
  if (await isTouchOnly(page)) {
    const t = await edgeSwipeOpen(page, menu);
    for (const id of items) await t.move(await center(page, `${menu}-item-${id}`), 8);
    await page.waitForTimeout(250);
    await t.end();
    return;
  }
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

/** Tap (touch) or click (mouse) a menu item while the menu is open. */
export async function tapItem(page: Page, menu: Menu, id: string) {
  const p = await center(page, `${menu}-item-${id}`);
  if (await isTouchOnly(page)) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
}

/** Opens a menu for tapping: a click on its corner dot, or on touch screens a swipe in from the edge. */
export async function openMenu(page: Page, menu: Menu) {
  if (await isTouchOnly(page)) {
    const t = await edgeSwipeOpen(page, menu);
    await t.end();
  } else {
    await page.getByTestId(`${menu}-hint`).click();
  }
  await expect(page.getByTestId(`${menu}-overlay`)).toBeVisible();
}
