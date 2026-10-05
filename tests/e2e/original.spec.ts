import { expect, test } from '@playwright/test';

import { expectAccessible, gotoApp, openMenu } from './helpers';

/** Greek accents have two Unicode forms (tonos/oxia) that look identical; compare decomposed text. */
const nfd = (s: string | null) => (s ?? '').normalize('NFD');
const expectGreek = async (loc: import('@playwright/test').Locator, greek: string) =>
  expect.poll(async () => nfd(await loc.textContent())).toContain(nfd(greek));

test.describe('original languages', () => {
  test('Hebrew text reads right to left with vowel points, in Ezra SIL', async ({ page }) => {
    await gotoApp(page, '/read/gen/1?tr=orig');
    const first = page.getByTestId('orig-word-1-0');
    await expect(first).toBeVisible();
    // בְּרֵאשִׁית with sheva, tsere, and other points (Unicode marks U+0591–U+05C7).
    const text = (await first.textContent()) ?? '';
    expect(text).toMatch(/[א-ת]/);
    expect(text).toMatch(/[֑-ׇ]/);
    const style = await page.getByTestId('orig-verse-1').locator('div[dir], div').first().evaluate((el) => {
      const s = getComputedStyle(el.querySelector('[lang="he"]') ?? el);
      return { direction: s.direction, font: s.fontFamily };
    });
    expect(style.direction).toBe('rtl');
    expect(style.font).toContain('Ezra SIL');
    await expectAccessible(page, 'Hebrew text');
  });

  test('Greek text uses Gentium Plus', async ({ page }) => {
    await gotoApp(page, '/read/jhn/1?tr=orig');
    const font = await page.getByTestId('orig-word-1-0').evaluate((el) => getComputedStyle(el).fontFamily);
    expect(font).toContain('Gentium Plus');
  });

  test('tapping a Hebrew word shows Strong’s, transliteration, and plain-English grammar', async ({ page }) => {
    await gotoApp(page, '/read/gen/1?tr=orig');
    await page.getByTestId('orig-word-1-0').click();
    const panel = page.getByTestId('word-panel');
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId('word-strongs')).toHaveText('Strong’s H7225');
    await expect(panel.getByTestId('word-grammar')).toContainText('Preposition');
    await expect(panel.getByTestId('word-grammar')).toContainText('Noun');
    await expect(panel).toContainText('be.re.Shit');
    await expectAccessible(page, 'word panel (Hebrew)');
  });

  test('tapping a KJV word shows its Greek word, root, pronunciation, definition, parsing, and usage', async ({ page }) => {
    await gotoApp(page, '/read/jhn/3');
    await page.getByTestId('verse-16').getByRole('button', { name: 'loved', exact: true }).click();
    const panel = page.getByTestId('word-panel');
    await expect(panel.getByTestId('word-strongs')).toHaveText('Strong’s G25');
    await expectGreek(panel.getByTestId('word-lemma'), 'ἀγαπάω');
    await expectGreek(panel, 'ἠγάπησεν');
    await expect(panel.getByTestId('word-grammar')).toContainText('Verb Aorist Active Indicative 3rd Singular');
    await expect(panel.getByTestId('word-pron')).toContainText('ag-ap-ah');
    await expect(panel.getByTestId('word-definition')).toBeVisible();
    await expect(panel.getByTestId('word-usage')).toContainText('143 times');
    await expect(panel).toContainText('love (');
  });

  test('tapping an ASV word shows the Hebrew or Greek word it translates', async ({ page }) => {
    const panel = page.getByTestId('word-panel');
    const tap = async (path: string, verse: number, word: string) => {
      await gotoApp(page, path);
      await page.getByTestId(`verse-${verse}`).getByRole('button', { name: word, exact: true }).click();
      await expect(panel).toBeVisible();
    };
    await tap('/read/jhn/3?tr=asv', 16, 'loved');
    await expect(panel.getByTestId('word-strongs')).toHaveText('Strong’s G25');
    await expectGreek(panel, 'ἠγάπησεν');
    await expect(panel.getByTestId('word-grammar')).toContainText('Verb Aorist Active Indicative 3rd Singular');
    await page.getByTestId('word-panel-close').click();
    // Where the ASV words differ from the KJV ("eternal" for "everlasting").
    await page.getByTestId('verse-16').getByRole('button', { name: 'eternal', exact: true }).click();
    await expect(panel.getByTestId('word-strongs')).toHaveText('Strong’s G166');
    await expectGreek(panel, 'αἰώνιον');
    await page.getByTestId('word-panel-close').click();
    // The ASV moves this phrase, so its parsing comes from aligning the ASV verse, not the KJV's.
    await tap('/read/rom/8?tr=asv', 28, 'to them that love');
    await expect(panel.getByTestId('word-strongs').first()).toHaveText('Strong’s G25');
    await expect(panel.getByTestId('word-grammar').first()).toContainText('V-PAP-DPM');
    await page.getByTestId('word-panel-close').click();
    await tap('/read/psa/23?tr=asv', 1, 'Jehovah');
    await expect(panel.getByTestId('word-strongs')).toHaveText('Strong’s H3068');
    await expect(panel).toContainText('Yah.weh');
    await expectAccessible(page, 'word panel (ASV)');
  });

  test('the ASV column of the parallel view has word taps too', async ({ page }) => {
    const panel = page.getByTestId('word-panel');
    await gotoApp(page, '/read/rom/8?tr=par');
    await page.getByTestId('par-asv-28').getByRole('button', { name: 'to them that love', exact: true }).click();
    await expect(panel.getByTestId('word-strongs').first()).toHaveText('Strong’s G25');
    await expect(panel.getByTestId('word-grammar').first()).toContainText('V-PAP-DPM');
    await page.getByTestId('word-panel-close').click();
    await page.getByTestId('par-kjv-28').getByRole('button', { name: 'all things', exact: true }).click();
    await expect(panel.getByTestId('word-strongs')).toHaveText('Strong’s G3956');
    await expect(panel.getByTestId('word-grammar')).toContainText('A-APN');
    await page.getByTestId('word-panel-close').click();
    await gotoApp(page, '/read/psa/23?tr=par');
    await page.getByTestId('par-asv-1').getByRole('button', { name: 'Jehovah', exact: true }).click();
    await expect(panel.getByTestId('word-strongs')).toHaveText('Strong’s H3068');
  });

  test('the word panel shows the root word as a link', async ({ page }) => {
    await gotoApp(page, '/read/1jn/4');
    await page.getByTestId('verse-8').getByRole('button', { name: 'love', exact: true }).first().click();
    const panel = page.getByTestId('word-panel');
    await expect(panel.getByTestId('word-strongs')).toHaveText('Strong’s G26');
    const root = panel.getByTestId('word-root');
    await expect(root).toContainText('G25');
    await root.getByRole('link', { name: 'G25' }).click();
    await expect(page).toHaveURL(/\/word\/G25/);
  });

  test('interlinear shows the original word under each English word', async ({ page }) => {
    await gotoApp(page, '/interlinear/jhn/3?v=16');
    const verse = page.getByTestId('il-verse-16');
    await expect(verse).toBeVisible();
    const loved = verse.getByRole('button', { name: /^loved: ēgapēsen \(G25\)$/ });
    await expectGreek(loved, 'ἠγάπησεν');
    await expect(loved).toContainText('G25');
    await loved.click();
    await expect(page.getByTestId('word-panel').getByTestId('word-strongs')).toHaveText('Strong’s G25');
    await page.getByTestId('word-panel-close').click();
    await expectAccessible(page, 'interlinear');
  });

  test('Old Testament interlinear pairs Hebrew under English', async ({ page }) => {
    await gotoApp(page, '/interlinear/gen/1');
    const verse = page.getByTestId('il-verse-1');
    await expect(verse.getByRole('button', { name: /^God: .*\(H430\)$/ })).toContainText('אֱלֹהִ');
  });

  test('guided word study: word → lexicons → usage → every occurrence', async ({ page }) => {
    await gotoApp(page, '/word/G25');
    await expect(page.getByRole('heading', { name: 'Word study: G25' })).toBeVisible();
    await expectGreek(page.getByTestId('ws-word'), 'ἀγαπάω');
    await expect(page.getByTestId('lex-step')).toContainText('Abbott-Smith');
    await expect(page.getByTestId('ws-lexicons')).toContainText('Thayer’s Greek-English Lexicon isn’t included');
    await expect(page.getByTestId('usage-table')).toContainText('143 times in 110 verses');
    const occ = page.getByTestId('occurrences');
    await expect(occ).toContainText('Showing 25 of 110 verses');
    await expect(page.getByTestId('occ-43003016')).toContainText('John 3:16');
    await page.getByTestId('occ-more').click();
    await expect(occ).toContainText('Showing 50 of 110 verses');
    await expectAccessible(page, 'word study');
    await page.getByTestId('occ-43003016').click();
    await expect(page).toHaveURL(/\/read\/jhn\/3\?v=16/);
  });

  test('a tapped word opens a word study in a new tab', async ({ page }) => {
    await gotoApp(page, '/read/jhn/3');
    await page.getByTestId('verse-16').getByRole('button', { name: 'loved', exact: true }).click();
    await page.getByRole('button', { name: 'Word study in a new tab' }).click();
    await expect(page).toHaveURL(/\/word\/G25/);
    await openMenu(page, 'tabs-menu');
    await expect(page.locator('[data-testid^="tabs-menu-item-t"]')).toHaveCount(2);
    await expect(page.getByTestId('tabs-menu-overlay')).toContainText('G25');
  });

  test('word lookup finds a word by transliteration or English', async ({ page }) => {
    await gotoApp(page, '/word');
    await page.getByTestId('word-lookup').fill('agape');
    await expect(page.getByRole('link', { name: /G26/ })).toBeVisible();
    await page.getByTestId('word-lookup').fill('H430');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/word\/H430/);
    await expect(page.getByTestId('lex-bdb')).toBeVisible();
  });
});
