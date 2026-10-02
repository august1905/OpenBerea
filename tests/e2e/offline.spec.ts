import { expect, test } from '@playwright/test';

import { gotoApp } from './helpers';

// The service worker caches the app shell at install and downloads the core data (KJV, ASV,
// Hebrew/Greek, lexicons, search) in the background, so reading works offline after the first visit.
test.use({ serviceWorkers: 'allow' });
test.describe.configure({ mode: 'serial', timeout: 240_000 });

async function cachedCount(page: import('@playwright/test').Page, paths: string[]) {
  return page.evaluate(async (ps) => {
    let n = 0;
    for (const name of await caches.keys()) {
      if (!name.startsWith('data-')) continue;
      const cache = await caches.open(name);
      for (const p of ps) if (await cache.match(p)) n++;
    }
    return n;
  }, paths);
}

test('works offline after the first visit', async ({ page, context }) => {
  await gotoApp(page, '/');
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 30_000 }).catch(async () => {
    // First load: the worker activates and claims the page.
    await page.reload();
    await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 30_000 });
  });
  const probe = [
    '/data/kjv/ROM/8.json',
    '/data/asv/PSA/23.json',
    '/data/stepbible/orig/GEN/1.json',
    '/data/stepbible/orig/JHN/3.json',
    '/data/kjv/JHN/3.json',
    '/data/search/kjv.json',
    '/data/stepbible/lex/G/0.json',
    '/data/stepbible/conc/G/0.json',
  ];
  await expect.poll(() => cachedCount(page, probe), { timeout: 200_000, intervals: [2000] }).toBe(probe.length);

  await context.setOffline(true);
  await page.goto('/read/rom/8');
  await expect(page.getByRole('heading', { name: 'Romans 8' })).toBeVisible();
  await expect(page.getByTestId('verse-28')).toContainText('all things work together for good');
  await page.goto('/read/psa/23?tr=asv');
  await expect(page.getByTestId('verse-1')).toContainText('Jehovah is my shepherd');
  await page.goto('/read/gen/1?tr=orig');
  await expect(page.getByTestId('orig-word-1-0')).toBeVisible();
  await page.goto('/word/G25');
  await expect(page.getByTestId('usage-table')).toContainText('143 times');
  await page.goto('/search?q=%22only%20begotten%22');
  await expect(page.getByTestId('hit-JHN-3-16')).toBeVisible();
  await context.setOffline(false);
});

test('stores no user data: no cookies, localStorage, sessionStorage, or IndexedDB', async ({ page, context }) => {
  await gotoApp(page, '/read/jhn/3');
  await page.getByTestId('version-asv').click();
  await page.keyboard.press('n');
  await page.getByTestId('quick-jump').fill('Rom 8');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/rom\/8/);
  const state = await page.evaluate(async () => ({
    local: localStorage.length,
    session: sessionStorage.length,
    cookie: document.cookie,
    idb: indexedDB.databases ? (await indexedDB.databases()).length : 0,
  }));
  expect(state).toEqual({ local: 0, session: 0, cookie: '', idb: 0 });
  expect(await context.cookies()).toEqual([]);
});
