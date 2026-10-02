import { expect, type Page, test } from '@playwright/test';

import { expectAccessible, gotoApp, openMenu, tapItem } from './helpers';

/** Greek accents have two Unicode forms (tonos/oxia) that look identical; compare decomposed text. */
const nfd = (s: string | null) => (s ?? '').normalize('NFD');

async function dataExists(page: Page, path: string) {
  const res = await page.request.get(`/data/${path}`);
  return res.ok();
}

test.describe('study tools', () => {
  test('cross-references on a verse: TSK and OpenBible.info with previews, and open in a new tab', async ({ page }) => {
    test.slow(); // large pages: axe checks hundreds of links
    await gotoApp(page, '/read/jhn/3');
    await page.getByTestId('verse-num-16').click();
    const sheet = page.getByTestId('verse-sheet');
    await expect(sheet).toBeVisible();
    const panel = sheet.getByTestId('verse-xref-panel');
    await expect(panel.getByTestId('verse-xrefs-tsk')).toBeVisible();
    const rom = panel.getByTestId('xref-tsk-ROM.5.8');
    await expect(rom).toContainText('Romans 5:8');
    // KJV preview, loaded lazily.
    await expect(rom).toContainText('But God commendeth his love toward us');
    // OpenBible.info: top ten by votes, then all.
    const ob = panel.getByTestId('verse-xrefs-ob');
    await expect(ob.getByTestId('xref-ob-ROM.5.8')).toBeVisible();
    const rows = ob.locator('[data-testid^="xref-link-ob-"]');
    await expect(rows).toHaveCount(10);
    await ob.getByTestId('verse-xrefs-ob-all').click();
    await expect(rows).toHaveCount(23);
    await expect(panel).toContainText('Treasury of Scripture Knowledge (public domain), cross-references from OpenBible.info (CC BY 4.0)');
    await expectAccessible(page, 'verse sheet with cross-references');

    await panel.getByRole('button', { name: 'Open Romans 5:8 in a new tab' }).first().click();
    await expect(page).toHaveURL(/\/read\/rom\/5\?v=8/);
    await openMenu(page, 'tabs-menu');
    await expect(page.locator('[data-testid^="tabs-menu-item-t"]')).toHaveCount(2);
  });

  test('tapping a cross-reference goes there', async ({ page }) => {
    await gotoApp(page, '/read/jhn/3');
    await page.getByTestId('verse-num-16').click();
    await page.getByTestId('xref-link-tsk-ROM.5.8').click();
    await expect(page).toHaveURL(/\/read\/rom\/5\?v=8/);
    await expect(page.getByTestId('verse-sheet')).toHaveCount(0);
    await expect(page.getByTestId('verse-8')).toBeVisible();
  });

  test('cross-references page lists every verse of the chapter', async ({ page }) => {
    test.slow(); // large pages: axe checks hundreds of links
    await gotoApp(page, '/study/crossrefs/jhn/3?v=16');
    await expect(page.getByRole('heading', { name: 'John 3 · Cross-references' })).toBeVisible();
    await expect(page.getByTestId('xref-tsk-1')).toContainText('Treasury of Scripture Knowledge');
    await expect(page.getByTestId('xrefs-open').getByTestId('xref-tsk-ROM.5.8')).toContainText('But God commendeth');
    await expect(page.getByTestId('study-credit')).toContainText('OpenBible.info (CC BY 4.0)');
    await expectAccessible(page, 'cross-references page');
    await page.getByTestId('xref-open-2').click();
    await expect(page).toHaveURL(/\/study\/crossrefs\/jhn\/3\?v=2$/);
    await expect(page.getByTestId('xrefs-open')).toBeVisible();
  });

  test('JFB commentary on John 3 has an entry for verse 16, with links and a switcher', async ({ page }) => {
    await gotoApp(page, '/study/commentary/jhn/3?c=jfb&v=16');
    await expect(page.getByRole('heading', { name: 'John 3', exact: true })).toBeVisible();
    const entry = page.getByTestId('comm-entry-16-16');
    await expect(entry.getByRole('heading', { name: 'Verse 16' })).toBeVisible();
    await expect(entry).toContainText('For God so loved');
    await expect(entry).toBeInViewport();
    await expect(page.getByTestId('comm-entry-14-16').getByRole('heading', { name: 'Verses 14–16' })).toBeAttached();
    await expect(page.getByTestId('commentary-switch-jfb')).toHaveAttribute('aria-current', 'true');
    await expect(page.getByTestId('gill-note')).toContainText('Gill’s Exposition');
    await expect(page.getByTestId('study-credit')).toContainText('public domain, via CrossWire');
    await expectAccessible(page, 'commentary');
    // Refs in the commentary are links to the reader (and keep the in-memory tabs: no page reload).
    await page.evaluate(() => ((window as unknown as { __alive: boolean }).__alive = true));
    await entry.getByRole('link', { name: 'Ro 8:32' }).click();
    await expect(page).toHaveURL(/\/read\/rom\/8\?v=32/);
    expect(await page.evaluate(() => (window as unknown as { __alive?: boolean }).__alive)).toBe(true);
  });

  test('commentary switcher, Barnes on the Old Testament, and the verse action', async ({ page }) => {
    await gotoApp(page, '/study/commentary/psa/23');
    await expect(page.getByTestId('commentary')).toBeVisible();
    await page.getByTestId('commentary-switch-barnes').click();
    await expect(page).toHaveURL(/c=barnes/);
    await expect(page.getByTestId('commentary-unavailable')).toContainText('only the New Testament');
    await expectAccessible(page, 'Barnes on the Old Testament');

    await gotoApp(page, '/read/jhn/3');
    await page.getByTestId('verse-num-16').click();
    await page.getByTestId('verse-action-commentary').click();
    await expect(page).toHaveURL(/\/study\/commentary\/jhn\/3\?v=16/);
    await expect(page.getByTestId('comm-entry-1-21')).toBeVisible();
  });

  test('study menu: passage tools in order, variants disabled on the Old Testament', async ({ page }) => {
    await gotoApp(page, '/read/psa/23');
    await openMenu(page, 'main-menu');
    await tapItem(page, 'main-menu', 'study');
    await tapItem(page, 'main-menu', 'study.passage');
    const ids = await page.locator('[data-testid^="main-menu-item-study."]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
    const order = ['study.commentary', 'study.crossrefs', 'study.inductive', 'study.variants'].map((id) => ids.indexOf(`main-menu-item-${id}`));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    await tapItem(page, 'main-menu', 'study.variants');
    await expect(page).toHaveURL(/\/read\/psa\/23/);
    await page.keyboard.press('Escape');
    await openMenu(page, 'main-menu');
    await tapItem(page, 'main-menu', 'study');
    await tapItem(page, 'main-menu', 'study.passage');
    await tapItem(page, 'main-menu', 'study.inductive');
    await expect(page).toHaveURL(/\/study\/inductive\/psa\/23/);
  });

  test('inductive study of Psalm 23: three sections, answers cleared on reload, nothing stored', async ({ page }) => {
    await gotoApp(page, '/study/inductive/psa/23');
    await expect(page.getByRole('heading', { name: 'Psalms 23 · Inductive study' })).toBeVisible();
    await expect(page.getByTestId('ind-passage')).toContainText('The Lord is my shepherd');
    for (const s of ['Observe', 'Interpret', 'Apply']) await expect(page.getByRole('heading', { name: s, exact: true })).toBeVisible();
    await expect(page.getByTestId('ind-not-saved')).toHaveText('Your answers stay on this page and are cleared when you leave it. Nothing is saved.');
    await expect(page.getByTestId('ind-observe')).toContainText('Who is speaking, and to whom?');
    await expect(page.getByTestId('ind-crossrefs')).toHaveAttribute('href', '/study/crossrefs/psa/23');
    await expectAccessible(page, 'inductive study');

    const box = page.getByTestId('ind-answer-o1');
    await box.fill('David, speaking of the LORD');
    await page.getByTestId('ind-answer-a2').fill('Trust in the shepherd');
    await expect(box).toHaveValue('David, speaking of the LORD');

    const stored = await page.evaluate(async () => ({
      local: localStorage.length,
      session: sessionStorage.length,
      cookie: document.cookie,
      idb: 'databases' in indexedDB ? (await indexedDB.databases()).length : 0,
    }));
    expect(stored).toEqual({ local: 0, session: 0, cookie: '', idb: 0 });

    await page.reload();
    await page.getByTestId('main-menu-hint').waitFor();
    await expect(page.getByTestId('ind-answer-o1')).toHaveValue('');
    await expect(page.getByTestId('ind-answer-a2')).toHaveValue('');
  });

  test('inductive answers are cleared on leaving the page', async ({ page }) => {
    await gotoApp(page, '/study/inductive/psa/23?from=1&to=3');
    await expect(page.getByTestId('ind-passage')).toContainText('He restoreth my soul');
    await expect(page.getByTestId('ind-passage')).not.toContainText('Yea, though I walk');
    await page.getByTestId('ind-answer-o2').fill('shepherd');
    await page.getByRole('link', { name: 'Whole chapter' }).click();
    await expect(page).toHaveURL(/\/study\/inductive\/psa\/23$/);
    await expect(page.getByTestId('ind-answer-o2')).toHaveValue('');
    await page.goBack();
    await expect(page.getByTestId('ind-answer-o2')).toHaveValue('');
  });

  test('textual variants for John 3: αὐτοῦ in verse 16 only in Treg, TR, Byz', async ({ page }) => {
    await gotoApp(page, '/study/variants/jhn/3');
    await expect(page.getByRole('heading', { name: 'John 3 · Textual variants' })).toBeVisible();
    const v16 = page.getByTestId('var-verse-16');
    await expect(v16).toBeVisible();
    const unit = v16.getByTestId('var-unit-16-10');
    await expect.poll(async () => nfd(await unit.textContent())).toContain(nfd('αὐτοῦ'));
    await expect(unit).toContainText('only in Treg, TR, Byz');
    // The word is marked in the verse's Greek text.
    const word = v16.getByTestId('var-word-16-10');
    expect(nfd(await word.textContent())).toBe(nfd('αὐτοῦ'));
    expect(await word.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
    // Alternative readings: verse 2 has Ἰησοῦν in the TR.
    await expect.poll(async () => nfd(await page.getByTestId('var-unit-2-4').textContent())).toContain(nfd('Ἰησοῦν'));
    await expect(page.getByTestId('var-unit-2-4')).toContainText('in TR');
    const legend = page.getByTestId('var-legend');
    for (const s of ['Nestle-Aland, 28th edition', 'Tyndale House Greek New Testament', 'SBL Greek New Testament', 'Westcott-Hort', 'Tregelles', 'Textus Receptus', 'Byzantine text']) {
      await expect(legend).toContainText(s);
    }
    await expect(page.getByTestId('study-credit')).toContainText('STEP Bible (CC BY 4.0), STEPBible.org');
    await expectAccessible(page, 'textual variants');
  });

  test('textual variants explain the Old Testament has none', async ({ page }) => {
    await gotoApp(page, '/study/variants/gen/1');
    await expect(page.getByTestId('var-ot')).toContainText('New Testament only');
    await expect(page.getByTestId('variants')).toHaveCount(0);
  });

  test('Easton’s “Aaron” loads from a headword search and links to Scripture', async ({ page }) => {
    await gotoApp(page, '/study/dictionary');
    test.skip(!(await dataExists(page, 'dict/easton/index.json')), 'dictionary data not generated');
    await expect(page.getByRole('heading', { name: 'Bible dictionaries' })).toBeVisible();
    await expectAccessible(page, 'dictionary index');
    await page.getByTestId('dict-search').fill('AARON');
    const easton = page.getByTestId('dict-results-easton');
    await expect(easton.getByRole('heading', { name: /Easton’s Bible Dictionary/ })).toBeVisible();
    await expectAccessible(page, 'dictionary search');
    await easton.getByRole('link', { name: 'Aaron', exact: true }).first().click();
    await expect(page).toHaveURL(/\/study\/dictionary\/easton\//);
    await expect(page.getByRole('heading', { name: /^Aaron$/i })).toBeVisible();
    const ref = page.getByTestId('dict-entry-body').locator('a[href^="/read/"]').first();
    await expect(ref).toBeVisible();
    await expect(page.getByTestId('study-credit')).toContainText('Easton’s Bible Dictionary, public domain, via CrossWire');
    await expectAccessible(page, 'dictionary entry');
    await ref.click();
    await expect(page).toHaveURL(/\/read\/[a-z0-9]{3}\/\d+/);
  });

  test('dictionary search ignores accents and case and groups by dictionary', async ({ page }) => {
    await gotoApp(page, '/study/dictionary');
    test.skip(!(await dataExists(page, 'dict/smith/index.json')), 'dictionary data not generated');
    await page.getByTestId('dict-search').fill('MOSÈS');
    await expect(page.getByTestId('dict-results')).toBeVisible();
    for (const d of ['easton', 'smith', 'isbe']) await expect(page.getByTestId(`dict-result-${d}-moses`)).toBeVisible();
    const groups = await page.locator('[data-testid^="dict-results-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
    expect(groups.length).toBeGreaterThan(1);
    await page.getByTestId('dict-search').fill('');
    await page.getByTestId('dict-switch-smith').click();
    await expect(page).toHaveURL(/d=smith/);
    await page.getByTestId('letters-M').click();
    await expect(page).toHaveURL(/l=M/);
    await expect(page.getByTestId('dict-entries')).toContainText('Maachah');
    // Long letters are shown a page at a time.
    await expect(page.getByTestId('dict-entries-moses')).toHaveCount(0);
    await page.getByTestId('dict-entries-more').click();
    await expect(page.getByTestId('dict-entries-moses')).toBeVisible();
    await page.getByTestId('dict-entries-moses').click();
    await expect(page).toHaveURL(/\/study\/dictionary\/smith\/moses/);
    await expect(page.getByTestId('entry-prev')).toBeVisible();
    await expect(page.getByTestId('entry-next')).toBeVisible();
  });

  test('Nave’s topical index: a topic with verse links to the reader', async ({ page }) => {
    test.slow(); // large pages: axe checks hundreds of links
    await gotoApp(page, '/study/topics');
    test.skip(!(await dataExists(page, 'dict/nave/index.json')), 'Nave data not generated');
    await expect(page.getByRole('heading', { name: 'Topical index' })).toBeVisible();
    await expectAccessible(page, 'topical index');
    await page.getByTestId('topic-search').fill('faith');
    await page.getByTestId('dict-results-nave').getByRole('link', { name: 'Faith', exact: true }).first().click();
    await expect(page).toHaveURL(/\/study\/topics\//);
    const body = page.getByTestId('dict-entry-body');
    const verses = body.locator('a[href^="/read/"]');
    await expect(verses.first()).toBeVisible();
    expect(await verses.count()).toBeGreaterThan(5);
    await expect(page.getByTestId('study-credit')).toContainText('Nave’s Topical Bible');
    await expectAccessible(page, 'topic');
    await verses.first().click();
    await expect(page).toHaveURL(/\/read\/[a-z0-9]{3}\/\d+/);
  });

  test('Nave’s cross-topic links (/study/dictionary/nave/…) open the topic view', async ({ page }) => {
    await gotoApp(page, '/study/topics/love');
    test.skip(!(await dataExists(page, 'dict/nave/index.json')), 'Nave data not generated');
    const link = page.getByTestId('dict-entry-body').locator('a[href^="/study/dictionary/nave/"]').first();
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/study\/dictionary\/nave\//);
    await expect(page.getByTestId('entry-back')).toHaveText('‹ All topics');
    await expect(page.getByTestId('dict-entry-body')).toBeVisible();
  });
});
