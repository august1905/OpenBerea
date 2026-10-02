import { expect, test } from '@playwright/test';

import { center, expectAccessible, gotoApp, openMenu, swipe, tapItem } from './helpers';

test.describe('corner menus', () => {
  test('shows a small dot in each active corner', async ({ page }) => {
    await gotoApp(page, '/');
    const vw = page.viewportSize()!;
    const main = await center(page, 'main-menu-hint');
    const tabs = await center(page, 'tabs-menu-hint');
    expect(main.x).toBeGreaterThan(vw.width - 60);
    expect(main.y).toBeGreaterThan(vw.height - 60);
    expect(tabs.x).toBeLessThan(60);
    expect(tabs.y).toBeGreaterThan(vw.height - 60);
  });

  test('click opens the main menu with the five top-level items', async ({ page }) => {
    await gotoApp(page, '/');
    await openMenu(page, 'main-menu');
    for (const id of ['read', 'search', 'study', 'memorize', 'resources']) {
      await expect(page.getByTestId(`main-menu-item-${id}`)).toBeVisible();
    }
    // Items sit in a quarter circle up and to the left of the corner.
    const origin = await center(page, 'main-menu-hint');
    for (const id of ['read', 'search', 'study', 'memorize', 'resources']) {
      const p = await center(page, `main-menu-item-${id}`);
      expect(p.x).toBeLessThanOrEqual(origin.x + 1);
      expect(p.y).toBeLessThan(origin.y);
    }
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('main-menu-overlay')).toHaveCount(0);
  });

  test('tapping a parent opens its arc; tapping a leaf acts', async ({ page }) => {
    await gotoApp(page, '/');
    await openMenu(page, 'main-menu');
    await tapItem(page, 'main-menu', 'read');
    await expect(page.getByTestId('main-menu-item-read.version')).toBeVisible();
    await tapItem(page, 'main-menu', 'read.goto');
    await expect(page).toHaveURL(/\/\?jump=1$/);
    await expect(page.getByTestId('quick-jump')).toBeFocused();
  });

  test('press-and-swipe through nested arcs selects a third-level item', async ({ page }) => {
    await gotoApp(page, '/read/jhn/3');
    await swipe(page, 'main-menu', ['read', 'read.version', 'read.par']);
    await expect(page).toHaveURL(/\/read\/jhn\/3\?tr=par/);
    await expect(page.getByTestId('main-menu-overlay')).toHaveCount(0);
  });

  test('display options toggle from the menu (layout, text size)', async ({ page }) => {
    await gotoApp(page, '/');
    await swipe(page, 'main-menu', ['read', 'read.display', 'display.paragraph']);
    await openMenu(page, 'main-menu');
    await tapItem(page, 'main-menu', 'read');
    await tapItem(page, 'main-menu', 'read.display');
    // The active option is marked.
    await expect(page.getByTestId('main-menu-overlay')).toContainText('Paragraphs ✓');
  });

  test('blocks text selection and the context menu in the corner zones', async ({ page }) => {
    await gotoApp(page, '/');
    const styles = await page.getByTestId('main-menu-hint').evaluate((el) => {
      const s = getComputedStyle(el);
      return { userSelect: s.userSelect, touchAction: s.touchAction };
    });
    expect(styles.userSelect).toBe('none');
    expect(styles.touchAction).toBe('none');
    const prevented = await page.getByTestId('tabs-menu-hint').evaluate((el) => {
      const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
      el.dispatchEvent(e);
      return e.defaultPrevented;
    });
    expect(prevented).toBe(true);
  });
});

test.describe('tabs', () => {
  test('the + sphere opens a new tab; spheres switch tabs', async ({ page }) => {
    await gotoApp(page, '/read/jhn/3');
    await openMenu(page, 'tabs-menu');
    await expect(page.getByTestId('tabs-menu-overlay')).toContainText('Jn 3');
    await tapItem(page, 'tabs-menu', 'new');
    await expect(page).toHaveURL(/\/$/);
    await page.getByTestId('quick-jump').fill('Rom 8');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/read\/rom\/8/);
    await openMenu(page, 'tabs-menu');
    const overlay = page.getByTestId('tabs-menu-overlay');
    await expect(overlay).toContainText('Jn 3');
    await expect(overlay).toContainText('Rom 8');
    // Switch back to the first tab by swiping to it.
    await page.keyboard.press('Escape');
    const ids = await page.locator('[data-testid^="tabs-menu-item-t"]').count();
    expect(ids).toBe(0);
    await openMenu(page, 'tabs-menu');
    const first = page.locator('[data-testid^="tabs-menu-item-t"]').first();
    const firstId = (await first.getAttribute('data-testid'))!.replace('tabs-menu-item-', '');
    await page.keyboard.press('Escape');
    await swipe(page, 'tabs-menu', [firstId]);
    await expect(page).toHaveURL(/\/read\/jhn\/3/);
  });

  test('dragging a sphere off the arc closes the tab', async ({ page }) => {
    await gotoApp(page, '/read/jhn/3');
    await page.keyboard.press('n');
    await expect(page).toHaveURL(/\/$/);
    await openMenu(page, 'tabs-menu');
    const spheres = page.locator('[data-testid^="tabs-menu-item-t"]');
    await expect(spheres).toHaveCount(2);
    const id = (await spheres.nth(1).getAttribute('data-testid'))!;
    const p = await center(page, id);
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(p.x + i * 14, p.y - i * 18);
    await expect(page.getByTestId('tabs-menu-overlay')).toContainText('Release to close');
    await page.mouse.up();
    await expect(spheres).toHaveCount(1);
    await expect(page).toHaveURL(/\/read\/jhn\/3/);
  });

  test('more than five tabs spill into an outer arc', async ({ page }) => {
    await gotoApp(page, '/');
    for (let i = 0; i < 5; i++) await page.keyboard.press('n');
    await openMenu(page, 'tabs-menu');
    const spheres = page.locator('[data-testid^="tabs-menu-item-"]');
    await expect(spheres).toHaveCount(7); // 6 tabs + "+"
    const origin = await center(page, 'tabs-menu-hint');
    const dist = async (i: number) => {
      const box = (await spheres.nth(i).boundingBox())!;
      return Math.hypot(box.x + box.width / 2 - origin.x, box.y + box.height / 2 - origin.y);
    };
    const inner = await dist(0);
    const outer = await dist(6);
    expect(outer).toBeGreaterThan(inner + 40);
  });

  test('keyboard shortcuts switch tabs', async ({ page }) => {
    await gotoApp(page, '/read/jhn/3');
    await page.keyboard.press('n');
    await page.getByTestId('quick-jump').fill('Gen 1');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/read\/gen\/1/);
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('1');
    await expect(page).toHaveURL(/\/read\/jhn\/3/);
    await page.keyboard.press(']');
    await expect(page).toHaveURL(/\/read\/gen\/1/);
    await page.keyboard.press('x');
    await expect(page).toHaveURL(/\/read\/jhn\/3/);
  });
});

test.describe('accessible list menus', () => {
  test('keyboard users get a standard list menu', async ({ page }) => {
    await gotoApp(page, '/');
    await page.keyboard.press('m');
    const dialog = page.getByRole('dialog', { name: 'Main menu' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Read, opens submenu' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Read' })).toBeVisible();
    await expectAccessible(page, 'list menu');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });

  test('screen-reader buttons open the menus', async ({ page }) => {
    await gotoApp(page, '/');
    await page.getByRole('button', { name: 'Open tabs menu (T)' }).focus();
    await expect(page.getByTestId('tabs-menu-button')).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Tabs' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'New tab' })).toBeVisible();
  });

  test('home page and open radial menu have no serious accessibility violations', async ({ page }) => {
    await gotoApp(page, '/');
    await expectAccessible(page, 'home');
    await openMenu(page, 'main-menu');
    await expectAccessible(page, 'radial menu open');
  });
});
