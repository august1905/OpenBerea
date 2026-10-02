import { expect, type Page, test } from '@playwright/test';

import { expectAccessible, gotoApp, openMenu, tapItem } from './helpers';

const JN316 = 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.';
const JN316_WORDS = JN316.match(/[\p{L}’'–-]+/gu)!;
const JN316_FIRST = JN316_WORDS.map((w) => w[0].toLowerCase()).join('');

const practice = (mode: string, ref = 'JHN.3.16', extra = '') => `/memorize/practice?ref=${ref}&tr=kjv&mode=${mode}${extra}`;

async function expectPerfect(page: Page) {
  await expect(page.getByTestId('practice-result')).toBeVisible();
  await expect(page.getByTestId('result-accuracy')).toHaveText('100%');
}

/** Nothing written to cookies, localStorage, sessionStorage, or IndexedDB. */
async function expectNothingStored(page: Page) {
  const stored = await page.evaluate(async () => ({
    local: localStorage.length,
    session: sessionStorage.length,
    cookie: document.cookie,
    idb: typeof indexedDB.databases === 'function' ? (await indexedDB.databases()).map((d) => d.name) : [],
  }));
  expect(stored).toEqual({ local: 0, session: 0, cookie: '', idb: [] });
  const cookies = await page.context().cookies();
  expect(cookies).toEqual([]);
}

test.describe('memorize', () => {
  test('dashboard: pick a passage and translation, say nothing is saved', async ({ page }) => {
    await gotoApp(page, '/memorize');
    await expect(page.getByRole('heading', { name: 'Memorize', exact: true })).toBeVisible();
    await expect(page.getByTestId('nothing-saved')).toContainText('Nothing is saved');
    await expect(page.getByTestId('session-score')).toContainText('Nothing is saved');
    await expectAccessible(page, 'memorize dashboard');

    await page.getByTestId('memorize-ref').fill('Rom 8:28-30');
    await expect(page.getByTestId('memorize-ref-preview')).toContainText('Romans 8:28–30, 3 verses');
    await page.getByTestId('pick-tr-asv').click();
    await page.getByTestId('pick-mode-scramble').click();
    await page.getByTestId('memorize-start').click();
    await expect(page).toHaveURL(/\/memorize\/practice\?ref=ROM\.8\.28-30&tr=asv&mode=scramble/);
    await expect(page.getByRole('heading', { name: 'Romans 8:28–30' })).toBeVisible();
    await expect(page.getByTestId('practice-scramble')).toBeVisible();
  });

  test('first letter: correct letters reveal every word for 100%', async ({ page }) => {
    await gotoApp(page, practice('first-letter'));
    await expect(page.getByTestId('practice-text')).toBeVisible();
    await expectAccessible(page, 'first letter');
    const input = page.getByTestId('first-letter-input');
    await input.click();
    // Punctuation and spaces are ignored; case doesn't matter.
    await input.pressSequentially(`${JN316_FIRST.slice(0, 5).toUpperCase()}, ${JN316_FIRST.slice(5)}`);
    await expectPerfect(page);
    await expect(page.getByTestId('practice-text')).toContainText('everlasting');
    await expect(page.getByTestId('session-accuracy')).toHaveText('100%');
    await expectAccessible(page, 'first letter result');
  });

  test('progressive hiding: rounds hide more words; finishing without peeks is 100%', async ({ page }) => {
    await gotoApp(page, practice('progressive', 'PSA.23.1'));
    await expect(page.getByTestId('progressive-status')).toContainText('Read it through');
    await expect(page.locator('[data-testid^="peek-"]')).toHaveCount(0);
    await expectAccessible(page, 'progressive');
    let previous = 0;
    for (let round = 0; round < 10; round++) {
      const next = page.getByTestId('progressive-next');
      if (!(await next.isVisible())) break;
      await next.click();
      const hidden = await page.locator('[data-testid^="peek-"]').count();
      expect(hidden).toBeGreaterThan(previous);
      previous = hidden;
    }
    expect(previous).toBe(9); // every word of Psalm 23:1 hidden
    await expectAccessible(page, 'progressive all hidden');
    await page.getByTestId('progressive-finish').click();
    await expectPerfect(page);
  });

  test('fill in the blank: lenient checking gives 100% for the right words', async ({ page }) => {
    await gotoApp(page, practice('fill-blank'));
    const inputs = page.locator('[data-testid^="blank-input-"]');
    const count = await inputs.count();
    expect(count).toBeGreaterThan(2);
    await expectAccessible(page, 'fill in the blank');
    for (let k = 0; k < count; k++) {
      const input = page.locator('[data-testid^="blank-input-"]').first();
      const index = Number((await input.getAttribute('data-testid'))!.replace('blank-input-', ''));
      // Case and punctuation are ignored.
      await input.fill(`${JN316_WORDS[index].toUpperCase()},`);
      await input.press('Enter');
      await expect(page.getByTestId(`blank-result-${index}`)).toBeVisible();
    }
    await expectPerfect(page);
  });

  test('reference → verse: a word-by-word recitation scores 100%', async ({ page }) => {
    await gotoApp(page, practice('ref-to-verse'));
    await expect(page.getByTestId('prompt-ref')).toHaveText('John 3:16');
    await expectAccessible(page, 'reference to verse');
    await page.getByTestId('recite-input').fill(JN316.toLowerCase().replace(/[,.]/g, ''));
    await page.getByTestId('recite-check').click();
    await expect(page.getByTestId('recite-diff')).toBeVisible();
    await expect(page.getByTestId('diff-missed')).toHaveCount(0);
    await expectPerfect(page);
    await expectAccessible(page, 'reference to verse result');
  });

  test('reference → verse: missed and extra words are shown and scored', async ({ page }) => {
    await gotoApp(page, practice('ref-to-verse'));
    await page.getByTestId('recite-input').fill('For God so loved the whole world that he gave his only begotten Son');
    await page.getByTestId('recite-check').click();
    await expect(page.getByTestId('diff-extra')).toHaveText('+whole');
    expect(await page.getByTestId('diff-missed').count()).toBeGreaterThan(5);
    await expect(page.getByTestId('result-accuracy')).not.toHaveText('100%');
  });

  test('verse → reference: a typed abbreviation counts and the heading hides the answer', async ({ page }) => {
    await gotoApp(page, practice('verse-to-ref'));
    await expect(page.getByRole('heading', { name: 'Which passage is this?' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'John 3:16' })).toHaveCount(0);
    await expectAccessible(page, 'verse to reference');
    await page.getByTestId('reference-input').fill('Jn 3:16');
    await expect(page.getByText('Reads as John 3:16')).toBeVisible();
    await page.getByTestId('reference-check').click();
    await expect(page.getByTestId('reference-feedback')).toContainText('Right: John 3:16');
    await expectPerfect(page);
  });

  test('word scramble: tapping words in order (buttons, no dragging) gives 100%', async ({ page }) => {
    await gotoApp(page, practice('scramble'));
    await expectAccessible(page, 'scramble');
    for (const word of JN316_WORDS) {
      await page.getByRole('button', { name: `Place “${word}”`, exact: true }).first().click();
    }
    await expectPerfect(page);
    await expect(page.getByTestId('scramble-built')).toContainText('everlasting life.');
  });

  test('word scramble works from the keyboard', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'keyboard');
    await gotoApp(page, practice('scramble', 'PSA.23.1'));
    const words = ['The', 'Lord', 'is', 'my', 'shepherd', 'I', 'shall', 'not', 'want'];
    for (const word of words) {
      await page.getByRole('button', { name: `Place “${word}”`, exact: true }).first().focus();
      await page.keyboard.press('Enter');
    }
    await expectPerfect(page);
  });

  test('phone: with the keyboard up, the input and the current word stay in view', async ({ page }, info) => {
    test.skip(info.project.name !== 'phone', 'phone layout');
    await gotoApp(page, practice('first-letter', 'PSA.23'));
    // About half the screen left above an on-screen keyboard.
    await page.setViewportSize({ width: 412, height: 480 });
    const input = page.getByTestId('first-letter-input');
    await input.click();
    await input.pressSequentially('tlimsisnwhmmtldigphlmbtsw');
    await expect(page.getByTestId('first-letter-status')).toContainText('Word 26 of 41');
    await expect(input).toBeInViewport();
    await expect(page.locator('#fl-25')).toBeInViewport();
  });

  test('a wrong input registers a missed word in the session score', async ({ page }) => {
    await gotoApp(page, practice('first-letter'));
    const input = page.getByTestId('first-letter-input');
    await input.click();
    await input.pressSequentially('fgx');
    await expect(page.getByTestId('first-letter-status')).toContainText('Not “x”');
    await expect(page.getByTestId('session-missed')).toContainText('so');
    await input.pressSequentially(JN316_FIRST.slice(2));
    await expect(page.getByTestId('practice-result')).toBeVisible();
    await expect(page.getByTestId('result-accuracy')).not.toHaveText('100%');
    await expect(page.getByTestId('session-missed')).toContainText('so');
    await expect(page.getByTestId('session-accuracy')).toHaveText('96%');

    // Scramble: a wrong tap is a miss too.
    await page.getByTestId('mode-scramble').click();
    await page.getByRole('button', { name: 'Place “life”', exact: true }).click();
    await expect(page.getByTestId('scramble-status')).toContainText('Not “life” yet');
    await expect(page.getByTestId('session-missed')).toContainText('For');

    // Clear resets the score.
    await page.getByTestId('session-clear').click();
    await expect(page.getByTestId('session-empty')).toBeVisible();
  });

  test('chapter mode: Psalm 23 has chunks, chain steps, and a whole run', async ({ page }) => {
    await gotoApp(page, practice('first-letter', 'PSA.23'));
    const chapter = page.getByTestId('chapter-mode');
    await expect(chapter).toBeVisible();
    await expect(page.getByTestId('part-chunk-1')).toHaveText('1–3');
    await expect(page.getByTestId('part-chunk-2')).toHaveText('4–6');
    await expect(page.getByTestId('part-chunk-1')).toHaveAttribute('aria-current', 'true');
    await expect(page.getByTestId('practice-first-letter')).toContainText('Practicing Psalms 23:1–3');
    await expectAccessible(page, 'chapter mode');

    await page.getByTestId('part-kind-chain').click();
    await expect(page).toHaveURL(/part=chain-1/);
    for (let i = 1; i <= 6; i++) await expect(page.getByTestId(`part-chain-${i}`)).toBeVisible();
    await expect(page.getByTestId('part-chain-3')).toHaveText('1–3');
    await expect(page.getByTestId('practice-first-letter')).toContainText('Practicing Psalms 23:1');

    // Chain step 1 is verse 1; finishing it offers the next step (verses 1–2).
    const input = page.getByTestId('first-letter-input');
    await input.click();
    await input.pressSequentially('tlimsisnw');
    await expectPerfect(page);
    await page.getByTestId('result-next').click();
    await expect(page).toHaveURL(/part=chain-2/);
    await expect(page.getByTestId('practice-first-letter')).toContainText('Practicing Psalms 23:1–2');

    // Chain steps work with other modes too.
    await page.getByTestId('mode-scramble').click();
    await expect(page).toHaveURL(/mode=scramble&part=chain-2/);
    await expect(page.getByTestId('practice-scramble')).toContainText('Practicing Psalms 23:1–2');

    await page.getByTestId('part-kind-all').click();
    await expect(page).toHaveURL(/part=all/);
    await expect(page.getByTestId('practice-scramble')).toContainText('Practicing Psalms 23:1–6');
  });

  test('starter sets open practice', async ({ page }) => {
    await gotoApp(page, '/memorize?view=starters');
    await expect(page.getByTestId('starter-sets')).toBeInViewport();
    await expect(page.getByTestId('starter-psalm-23')).toContainText('Psalms 23');
    await expect(page.getByTestId('starter-romans-8')).toBeVisible();
    expect(await page.locator('[data-testid^="starter-"]').count()).toBeGreaterThanOrEqual(21);
    await page.getByTestId('starter-psalm-23').click();
    await expect(page).toHaveURL(/\/memorize\/practice\?ref=PSA\.23&tr=kjv&mode=first-letter/);
    await expect(page.getByRole('heading', { name: 'Psalms 23' })).toBeVisible();
    await expect(page.getByTestId('chapter-mode')).toBeVisible();
  });

  test('menus and the verse action lead to practice', async ({ page }) => {
    await gotoApp(page, '/read/jhn/3');
    await openMenu(page, 'main-menu');
    await tapItem(page, 'main-menu', 'memorize');
    await expect(page.getByTestId('main-menu-item-memorize.passage')).toBeVisible();
    await tapItem(page, 'main-menu', 'memorize.passage');
    await expect(page).toHaveURL(/\/memorize\/practice\?ref=JHN\.3&tr=kjv&mode=first-letter/);
    await expect(page.getByTestId('chapter-mode')).toBeVisible();

    await gotoApp(page, '/read/jhn/3?tr=asv');
    await page.getByTestId('verse-num-16').click();
    await page.getByTestId('verse-action-memorize').click();
    await expect(page).toHaveURL(/\/memorize\/practice\?ref=JHN\.3\.16&tr=asv&mode=first-letter/);
    await expect(page.getByTestId('practice-text')).toBeVisible();

    await openMenu(page, 'main-menu');
    await tapItem(page, 'main-menu', 'memorize');
    await expect(page.getByTestId('main-menu-item-memorize.starters')).toBeVisible();
    await tapItem(page, 'main-menu', 'memorize.starters');
    await expect(page).toHaveURL(/\/memorize\?view=starters/);
    await expect(page.getByTestId('starter-sets')).toBeInViewport();

    await openMenu(page, 'main-menu');
    await tapItem(page, 'main-menu', 'memorize');
    await expect(page.getByTestId('main-menu-item-memorize.dashboard')).toBeVisible();
    await tapItem(page, 'main-menu', 'memorize.dashboard');
    await expect(page).toHaveURL(/\/memorize$/);
  });

  test('the session score resets on reload and nothing is stored', async ({ page }) => {
    await gotoApp(page, practice('first-letter'));
    const input = page.getByTestId('first-letter-input');
    await input.click();
    await input.pressSequentially(`x${JN316_FIRST}`);
    await expect(page.getByTestId('practice-result')).toBeVisible();
    await expect(page.getByTestId('session-missed')).toContainText('For');
    await page.getByTestId('mode-verse-to-ref').click();
    await page.getByTestId('reference-input').fill('Rom 3:16');
    await page.getByTestId('reference-check').click();
    await expect(page.getByTestId('session-missed')).toContainText('John 3:16');
    await page.getByTestId('practice-back').click();
    await expect(page.getByTestId('session-accuracy')).toBeVisible();
    await expect(page.getByTestId('session-missed')).toContainText('For');

    await expectNothingStored(page);

    await page.reload();
    await page.getByTestId('main-menu-hint').waitFor();
    await expect(page.getByTestId('session-empty')).toBeVisible();
    await expect(page.getByTestId('session-accuracy')).toHaveCount(0);
    await expectNothingStored(page);
  });
});
