import { expect, test } from '@playwright/test';

import { expectAccessible, gotoApp, openMenu, swipe, tapItem } from './helpers';

test.describe('external resources', () => {
  test('verse tools link out to study sites for that verse', async ({ page }) => {
    await gotoApp(page, '/read/jhn/3');
    await page.getByTestId('verse-num-16').click();
    const links = page.getByTestId('verse-sheet').getByTestId('study-links');
    await expect(links.getByRole('link', { name: /Blue Letter Bible \(opens/ })).toHaveAttribute('href', 'https://www.blueletterbible.org/kjv/jhn/3/16/');
    await expect(links.getByRole('link', { name: /Bible Hub \(opens/ })).toHaveAttribute('href', 'https://biblehub.com/john/3-16.htm');
    await expect(links.getByRole('link', { name: /STEP Bible/ })).toHaveAttribute('href', /reference=John\.3\.16/);
    await expect(links.getByRole('link').first()).toHaveAttribute('target', '_blank');
  });

  test('word details link out to lexicons for that word', async ({ page }) => {
    await gotoApp(page, '/read/jhn/3');
    await page.getByTestId('verse-16').getByRole('button', { name: 'loved', exact: true }).click();
    const links = page.getByTestId('word-panel').getByTestId('word-links');
    await expect(links.getByRole('link', { name: /Blue Letter Bible lexicon/ })).toHaveAttribute('href', 'https://www.blueletterbible.org/lexicon/g25/kjv/tr/0-1/');
    await expect(links.getByRole('link', { name: /Bible Hub Strong’s/ })).toHaveAttribute('href', 'https://biblehub.com/greek/25.htm');
  });

  test('featured teachers are linked by passage, with their attribution', async ({ page }) => {
    await gotoApp(page, '/read/rom/8');
    await openMenu(page, 'main-menu');
    await tapItem(page, 'main-menu', 'resources');
    await tapItem(page, 'main-menu', 'res.passage');
    await expect(page).toHaveURL(/\/resources\/passage\?ref=ROM\.8/);
    await expect(page.getByTestId('dg-link')).toHaveAttribute('href', 'https://www.desiringgod.org/scripture/romans/8');
    await expect(page.getByTestId('heartcry-link')).toHaveAttribute('href', 'https://www.sermonaudio.com/broadcasters/heartcry/sermons?book=ROM&chapter=8');
    await expect(page.getByTestId('gty-link')).toBeVisible();
    await expect(page.getByTestId('teacher-links')).toContainText('By John Piper. © Desiring God Foundation. Source: desiringGod.org');
    await expect(page.getByTestId('res-dg-free-from-judgment-fighting-sin-full-assurance')).toBeVisible();
    await expectAccessible(page, 'passage resources');
  });

  test('the library filters by book, topic, and teacher', async ({ page }) => {
    await gotoApp(page, '/resources');
    const count = page.getByTestId('res-count');
    await expect(count).toHaveText('31 resources');
    await page.getByTestId('f-book-JHN').click();
    await expect(page).toHaveURL(/book=jhn/);
    await expect(count).toHaveText('5 resources');
    await page.getByTestId('f-teacher-John MacArthur').click();
    await expect(count).toHaveText('1 resources');
    await expectAccessible(page, 'library');
  });

  test('Piper video loads only on request, from youtube-nocookie, whole, with attribution', async ({ page }) => {
    await gotoApp(page, '/resources?teacher=John%20Piper');
    const card = page.getByTestId('res-dg-latb-our-favorite-verse-in-the-bible');
    const embed = card.getByTestId('embed-dg-latb-our-favorite-verse-in-the-bible');
    await expect(page.locator('iframe')).toHaveCount(0);
    await embed.click();
    const frame = card.locator('iframe');
    await expect(frame).toHaveAttribute('src', /^https:\/\/www\.youtube-nocookie\.com\/embed\/[\w-]+\?autoplay=1&rel=0$/);
    await expect(card).toContainText('By John Piper. © Desiring God Foundation. Source: desiringGod.org');
  });

  test('Piper audio streams from Desiring God without preloading', async ({ page }) => {
    await gotoApp(page, '/resources?teacher=John%20Piper');
    const audio = page.locator('audio').first();
    await expect(audio).toHaveAttribute('preload', 'none');
    await expect(audio).toHaveAttribute('src', /^https:\/\/audio\.desiringgod\.org\//);
  });

  test('Grace to You and HeartCry items are links only', async ({ page }) => {
    await gotoApp(page, '/resources/teachers');
    const gty = page.getByTestId('teacher-gty.org');
    await expect(gty.locator('audio, iframe')).toHaveCount(0);
    await expect(gty).toContainText('Copyright Grace to You');
    const hc = page.getByTestId('teacher-heartcrymissionary.com');
    await expect(hc.locator('audio, iframe, img')).toHaveCount(0);
    await expect(hc).toContainText('HeartCry Missionary Society');
    await expectAccessible(page, 'teachers');
  });

  test('Desiring God link is hidden for books it has no index for', async ({ page }) => {
    await gotoApp(page, '/resources/passage?ref=EST.4');
    await expect(page.getByTestId('dg-link')).toHaveCount(0);
    await expect(page.getByTestId('teacher-links')).toContainText('no Scripture index page');
  });

  test('the library opens from the main menu', async ({ page }) => {
    await gotoApp(page, '/');
    await swipe(page, 'main-menu', ['resources', 'res.library']);
    await expect(page).toHaveURL(/\/resources$/);
  });
});
