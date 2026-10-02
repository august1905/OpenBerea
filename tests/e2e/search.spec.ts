import { expect, test } from '@playwright/test';

import { expectAccessible, gotoApp, swipe } from './helpers';

test.describe('search', () => {
  test('opens from the main menu and the / shortcut', async ({ page }) => {
    await gotoApp(page, '/read/jhn/3');
    await swipe(page, 'main-menu', ['search']);
    await expect(page).toHaveURL(/\/search/);
    await gotoApp(page, '/');
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('/');
    await expect(page).toHaveURL(/\/search/);
    await expect(page.getByTestId('search-input')).toBeFocused();
  });

  test('keyword search finds verses containing every word', async ({ page }) => {
    await gotoApp(page, '/search');
    await page.getByTestId('search-input').fill('faith hope charity');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/q=faith/);
    await expect(page.getByTestId('hit-1CO-13-13')).toBeVisible();
    await expect(page.getByTestId('hit-1CO-13-13')).toContainText('And now abideth faith, hope, charity');
    await expectAccessible(page, 'search results');
  });

  test('phrase search, book filter, and paging', async ({ page }) => {
    await gotoApp(page, '/search?q=%22only%20begotten%22');
    await expect(page.getByTestId('mode-phrase')).toHaveAttribute('aria-current', 'true');
    await expect(page.getByTestId('hit-JHN-3-16')).toBeVisible();
    await page.getByTestId('search-book-HEB').click();
    await expect(page.getByTestId('hit-HEB-11-17')).toBeVisible();
    await expect(page.getByTestId('hit-JHN-3-16')).toHaveCount(0);
    await gotoApp(page, '/search?q=lord');
    await expect(page.getByTestId('search-count')).toContainText('verses');
    await page.getByTestId('search-more').click();
    await expect(page.locator('[data-testid^="hit-"]')).toHaveCount(100);
  });

  test('ASV results use the ASV text', async ({ page }) => {
    await gotoApp(page, '/search?q=Jehovah%20shepherd&tr=asv');
    await expect(page.getByTestId('hit-PSA-23-1')).toContainText('Jehovah is my shepherd');
  });

  test('Strong’s number search lists every verse using the word', async ({ page }) => {
    await gotoApp(page, '/search?q=G25');
    await expect(page.getByTestId('mode-strongs')).toHaveAttribute('aria-current', 'true');
    await expect(page.getByTestId('search-count')).toHaveText('110 verses');
    await expect(page.getByTestId('hit-JHN-3-16')).toBeVisible();
    await expectAccessible(page, 'Strong’s search');
  });

  test('original-language word search by Greek, Hebrew, or transliteration', async ({ page }) => {
    await gotoApp(page, '/search?q=%E1%BC%80%CE%B3%CE%AC%CF%80%CE%B7'); // ἀγάπη
    await expect(page.getByTestId('original-results')).toContainText('G26');
    await page.getByTestId('find-G26').click();
    await expect(page).toHaveURL(/q=G26/);
    await expect(page.getByTestId('hit-1CO-13-13')).toBeVisible();
    await gotoApp(page, '/search?q=chesed&mode=original');
    await expect(page.getByTestId('original-results')).toContainText('H2617');
  });
});
