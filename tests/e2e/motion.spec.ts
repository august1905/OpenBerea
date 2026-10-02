import { expect, type Page, test } from '@playwright/test';

import { center, gotoApp, openMenu } from './helpers';

// The corner menus' motion (src/components/radial/engine.web.ts). Animated parts carry data-m/data-k;
// test ids stay on still anchors at each item's resting place.

const dot = (page: Page, key: string) => page.locator(`[data-m="dot"][data-k="${key}"]`);

async function visualCenter(page: Page, key: string) {
  const b = (await dot(page, key).boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

const width = async (page: Page, key: string) => (await dot(page, key).boundingBox())!.width;
const partOpacity = (page: Page, key: string, part: string) =>
  dot(page, key).locator(`[data-m="${part}"]`).evaluate((el) => Number(getComputedStyle(el).opacity));
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

/** Opens the main menu with a click, then parks the pointer far from it. */
async function openAndPark(page: Page) {
  await openMenu(page, 'main-menu');
  await page.mouse.move(40, 40);
}

test.describe('corner menu motion', () => {
  test('the corner dot swells and leans toward a pointer that comes near, and previews the arc', async ({ page }) => {
    await gotoApp(page, '/read/jhn/3');
    await page.mouse.move(150, 150);
    const zone = await center(page, 'main-menu-hint');
    const dotBox = () => page.getByTestId('main-menu-hint-dot').boundingBox();
    await page.waitForTimeout(400);
    const rest = (await dotBox())!;
    const previews = page.getByTestId('main-menu-hint').locator('[data-m="hint-ghost"]');
    await expect(previews).toHaveCount(5);
    expect(Number(await previews.first().evaluate((el) => getComputedStyle(el).opacity))).toBe(0);

    await page.mouse.move(zone.x - 60, zone.y - 45, { steps: 6 });
    await expect.poll(async () => (await dotBox())!.width).toBeGreaterThan(rest.width * 1.35);
    // Leans toward the pointer (up and to the left).
    await expect.poll(async () => { const b = (await dotBox())!; return b.x + b.width / 2; }).toBeLessThan(zone.x - 3);
    await expect.poll(async () => { const b = (await dotBox())!; return b.y + b.height / 2; }).toBeLessThan(zone.y - 3);
    await expect.poll(() => previews.first().evaluate((el) => Number(getComputedStyle(el).opacity))).toBeGreaterThan(0.3);

    // And settles back when it leaves.
    await page.mouse.move(150, 150, { steps: 6 });
    await expect.poll(async () => (await dotBox())!.width).toBeLessThan(rest.width * 1.3);
  });

  test('items spring out from the corner and settle at their places', async ({ page }) => {
    await gotoApp(page, '/');
    await page.mouse.move(40, 40);
    // Record, frame by frame, how far Resources (the last to come out) is from its resting place.
    await page.evaluate(() => {
      const w = window as unknown as { offsets: number[] };
      w.offsets = [];
      const sample = () => {
        const el = document.querySelector<HTMLElement>('[data-m="dot"][data-k="0-resources"]');
        const m = el && /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(el.style.transform);
        if (m) w.offsets.push(Math.hypot(Number(m[1]), Number(m[2])));
        if (w.offsets.length < 90) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    await page.getByTestId('main-menu-hint').click();
    await page.mouse.move(40, 40);
    await page.waitForFunction(() => (window as unknown as { offsets: number[] }).offsets.length >= 90);
    const offsets = await page.evaluate(() => (window as unknown as { offsets: number[] }).offsets);
    expect(offsets[0]).toBeGreaterThan(80); // starts near the corner…
    expect(offsets[offsets.length - 1]).toBeLessThan(3); // …and settles at its place
    const anchor = await center(page, 'main-menu-item-resources');
    await expect.poll(async () => dist(await visualCenter(page, '0-resources'), anchor)).toBeLessThan(3);
    // Lines and dotted ring guides come with them.
    await expect(page.locator('[data-m="line"]')).toHaveCount(5);
    await expect(page.locator('[data-m="ring"]')).toHaveCount(1);
  });

  test('hovering an item magnifies it, fills it with gold, and shows its icon; neighbors swell less', async ({ page }) => {
    await gotoApp(page, '/');
    await openAndPark(page);
    await page.waitForTimeout(700);
    const restWidth = await width(page, '0-search');
    expect(await partOpacity(page, '0-search', 'fill')).toBe(0);
    const target = await center(page, 'main-menu-item-search');
    await page.mouse.move(target.x, target.y, { steps: 8 });
    await expect.poll(() => width(page, '0-search')).toBeGreaterThan(restWidth * 1.4);
    await expect.poll(() => partOpacity(page, '0-search', 'fill')).toBeGreaterThan(0.8);
    await expect.poll(() => partOpacity(page, '0-search', 'icon')).toBeGreaterThan(0.6);
    const neighbor = await width(page, '0-study');
    expect(neighbor).toBeGreaterThan(restWidth * 1.02);
    expect(neighbor).toBeLessThan(await width(page, '0-search'));
  });

  test('a label works like its dot: hovering lights the dot, tapping chooses it', async ({ page }) => {
    await gotoApp(page, '/');
    await openAndPark(page);
    await page.waitForTimeout(700);
    const label = (await page.locator('[data-m="label"][data-k="0-search"]').boundingBox())!;
    await page.mouse.move(label.x + label.width / 2, label.y + label.height / 2, { steps: 6 });
    await expect.poll(() => partOpacity(page, '0-search', 'fill')).toBeGreaterThan(0.8);
    await page.mouse.down();
    await page.mouse.up();
    await expect(page).toHaveURL(/\/search$/);
  });

  test('a swipe leaves a comet trail behind the pointer', async ({ page }) => {
    await gotoApp(page, '/');
    const start = await center(page, 'main-menu-hint');
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(start.x - i * 12, start.y - i * 9);
    const trail = page.locator('[data-m="trail"]');
    await expect(trail).toHaveCount(12);
    await expect.poll(() => trail.first().evaluate((el) => Number(getComputedStyle(el).opacity))).toBeGreaterThan(0.2);
    await page.mouse.up();
  });

  test('closing animates out on a ghost layer that tests and screen readers never see', async ({ page }) => {
    await gotoApp(page, '/');
    await openAndPark(page);
    await page.waitForTimeout(500);
    await page.keyboard.press('Escape');
    // The menu itself is gone at once…
    await expect(page.getByTestId('main-menu-overlay')).toHaveCount(0);
    await expect(page.locator('[data-testid^="main-menu-item-"]')).toHaveCount(0);
    // …while its copies fall back into the corner, then disappear.
    const ghosts = page.getByTestId('main-menu-ghosts');
    expect(await ghosts.locator(':scope > *').count()).toBeGreaterThan(0);
    expect(await ghosts.getAttribute('aria-hidden')).toBe('true');
    expect(await ghosts.locator('[data-testid]').count()).toBe(0);
    await expect(ghosts.locator(':scope > *')).toHaveCount(0);
  });

  test('a sphere glides to its new place when another tab closes', async ({ page }) => {
    await gotoApp(page, '/read/jhn/3');
    await page.keyboard.press('n');
    await openMenu(page, 'tabs-menu');
    await page.mouse.move(600, 100);
    const spheres = page.locator('[data-testid^="tabs-menu-item-t"]');
    await expect(spheres).toHaveCount(2);
    // Closing the first tab moves the second into its place.
    const closingId = (await spheres.nth(0).getAttribute('data-testid'))!;
    const stayingId = (await spheres.nth(1).getAttribute('data-testid'))!.replace('tabs-menu-item-', '');
    await page.waitForTimeout(700);
    const p = await center(page, closingId);
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(p.x + i * 14, p.y - i * 18);
    // From the release on, record how far the staying sphere is from its (new) resting place.
    await page.evaluate((key) => {
      const w = window as unknown as { offsets: number[] };
      w.offsets = [];
      const sample = () => {
        const el = document.querySelector<HTMLElement>(`[data-m="dot"][data-k="${key}"]`);
        const m = el && /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(el.style.transform);
        if (m) w.offsets.push(Math.hypot(Number(m[1]), Number(m[2])));
        if (w.offsets.length < 60) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    }, `0-${stayingId}`);
    await page.mouse.up();
    await expect(spheres).toHaveCount(1);
    await page.mouse.move(600, 100);
    await page.waitForFunction(() => (window as unknown as { offsets: number[] }).offsets.length >= 60);
    const offsets = await page.evaluate(() => (window as unknown as { offsets: number[] }).offsets);
    // It starts out where it was (far from the new place) and glides in.
    expect(Math.max(...offsets)).toBeGreaterThan(40);
    expect(offsets[offsets.length - 1]).toBeLessThan(4);
  });
});

test.describe('corner menu motion with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('nothing moves or loops; items are simply there', async ({ page }) => {
    await gotoApp(page, '/');
    await page.mouse.move(150, 150);
    const hintDot = page.getByTestId('main-menu-hint-dot');
    expect(await hintDot.evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
    const rest = (await hintDot.boundingBox())!;
    const zone = await center(page, 'main-menu-hint');
    await page.mouse.move(zone.x - 50, zone.y - 40, { steps: 6 });
    await page.waitForTimeout(400);
    const near = (await hintDot.boundingBox())!;
    expect(Math.abs(near.width - rest.width)).toBeLessThan(0.5);
    expect(Math.abs(near.x - rest.x)).toBeLessThan(0.5);

    await openAndPark(page);
    const anchor = await center(page, 'main-menu-item-resources');
    expect(dist(await visualCenter(page, '0-resources'), anchor)).toBeLessThan(0.5);
  });
});
