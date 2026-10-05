import { expect, test } from '@playwright/test';

import { expectAccessible, gotoApp, openMenu, swipe, tapItem } from './helpers';

const JN316_KJV = 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.';
const JN316_ASV = 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth on him should not perish, but have eternal life.';

test.describe('reader', () => {
  test('opens a chapter in the KJV by direct link', async ({ page }) => {
    await gotoApp(page, '/read/jhn/3');
    await expect(page.getByRole('heading', { name: 'John 3' })).toBeVisible();
    await expect(page.getByTestId('verse-16')).toContainText(JN316_KJV);
    await expect(page).toHaveTitle(/John 3 \(KJV\)/);
    await expectAccessible(page, 'reader KJV');
  });

  test('switches between KJV and ASV instantly and shows them side by side', async ({ page }) => {
    test.slow(); // axe checks every word button in both columns (about 1,100 in John 3)
    await gotoApp(page, '/read/jhn/3');
    await page.getByTestId('version-asv').click();
    await expect(page).toHaveURL(/tr=asv/);
    await expect(page.getByTestId('verse-16')).toContainText(JN316_ASV);
    await page.getByTestId('version-par').click();
    await expect(page).toHaveURL(/tr=par/);
    const row = page.getByTestId('par-16');
    await expect(row).toContainText(JN316_KJV);
    await expect(row).toContainText(JN316_ASV);
    await expectAccessible(page, 'parallel view');
    await page.getByTestId('version-kjv').click();
    await expect(page).not.toHaveURL(/tr=/);
  });

  test('parallel view is two columns on desktop', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'desktop layout');
    await gotoApp(page, '/read/jhn/3?tr=par');
    const row = page.getByTestId('par-16');
    const cells = row.locator(':scope > div');
    await expect(cells).toHaveCount(2);
    const [a, b] = [await cells.nth(0).boundingBox(), await cells.nth(1).boundingBox()];
    expect(b!.x).toBeGreaterThan(a!.x + a!.width - 1);
    expect(Math.abs(a!.y - b!.y)).toBeLessThan(2);
  });

  test('quick jump accepts typed references and abbreviations', async ({ page }) => {
    for (const [typed, url, heading] of [
      ['Jn 3:16', /\/read\/jhn\/3\?v=16/, 'John 3'],
      ['1 Cor 13', /\/read\/1co\/13$/, '1 Corinthians 13'],
      ['ps23', /\/read\/psa\/23$/, 'Psalms 23'],
      ['Song of Solomon 2:4', /\/read\/sng\/2\?v=4/, 'Song of Solomon 2'],
      ['Jude 3', /\/read\/jud\/1\?v=3/, 'Jude 1'],
    ] as const) {
      await gotoApp(page, '/');
      await page.getByTestId('quick-jump').fill(typed);
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(url);
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    }
  });

  test('a verse link highlights and scrolls to the verse', async ({ page }) => {
    await gotoApp(page, '/read/psa/119?v=105');
    const verse = page.getByTestId('verse-105');
    await expect(verse).toBeInViewport();
    const bg = await verse.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).not.toBe('rgba(0, 0, 0, 0)');
  });

  test('red letter marks the words of Christ and can be turned off', async ({ page }) => {
    await gotoApp(page, '/read/jhn/3');
    const word = page.getByTestId('verse-16').getByText('loved', { exact: true });
    const red = await word.evaluate((el) => getComputedStyle(el).color);
    const plain = await page.getByTestId('verse-1').getByText('Pharisees', { exact: false }).first().evaluate((el) => getComputedStyle(el).color);
    expect(red).not.toBe(plain);
    await swipe(page, 'main-menu', ['read', 'read.display', 'display.redLetter']);
    await expect.poll(() => word.evaluate((el) => getComputedStyle(el).color)).toBe(plain);
  });

  test('verse-per-line and paragraph layouts', async ({ page }) => {
    await gotoApp(page, '/read/mrk/1');
    const verseLines = await page.getByTestId('chapter-text').locator(':scope > div').count();
    expect(verseLines).toBe(45);
    await openMenu(page, 'main-menu');
    await tapItem(page, 'main-menu', 'read');
    await tapItem(page, 'main-menu', 'read.display');
    await tapItem(page, 'main-menu', 'display.paragraph');
    await expect.poll(() => page.getByTestId('chapter-text').locator(':scope > div').count()).toBeLessThan(20);
    await expect(page.getByTestId('verse-1')).toBeVisible();
  });

  test('previous and next chapter, including arrow keys and the back button', async ({ page }) => {
    await gotoApp(page, '/read/gen/50');
    await page.getByTestId('next-chapter').click();
    await expect(page).toHaveURL(/\/read\/exo\/1/);
    await page.keyboard.press('ArrowLeft');
    await expect(page).toHaveURL(/\/read\/gen\/50/);
    await page.keyboard.press('ArrowRight');
    await expect(page).toHaveURL(/\/read\/exo\/1/);
    await page.goBack();
    await expect(page).toHaveURL(/\/read\/gen\/50/);
    await expect(page.getByRole('heading', { name: 'Genesis 50' })).toBeVisible();
  });

  test('a missing chapter shows a clear message', async ({ page }) => {
    await gotoApp(page, '/read/jhn/99');
    await expect(page.getByText("That chapter doesn't exist.")).toBeVisible();
  });

  test('book browser opens a chapter', async ({ page }) => {
    await gotoApp(page, '/');
    await page.getByTestId('book-GEN').click();
    await expect(page.getByTestId('chapter-GEN-50')).toBeVisible();
    await page.getByTestId('chapter-GEN-3').click();
    await expect(page).toHaveURL(/\/read\/gen\/3/);
  });

  test('verse of the day shows a verse from the built-in list and links to it', async ({ page }) => {
    await gotoApp(page, '/');
    const votd = page.getByTestId('votd');
    await expect(votd).toContainText('Verse of the day');
    await expect.poll(async () => ((await votd.textContent()) ?? '').length).toBeGreaterThan(40);
    await votd.click();
    await expect(page).toHaveURL(/\/read\/[a-z0-9]{3}\/\d+\?v=\d+/);
  });

  test('verse numbers open the verse tools, including a new tab', async ({ page }) => {
    await gotoApp(page, '/read/rom/8');
    await page.getByTestId('verse-num-28').click();
    const sheet = page.getByTestId('verse-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText('Romans 8:28');
    await expectAccessible(page, 'verse sheet');
    await page.getByTestId('verse-action-newtab').click();
    await openMenu(page, 'tabs-menu');
    await expect(page.locator('[data-testid^="tabs-menu-item-t"]')).toHaveCount(2);
  });
});
