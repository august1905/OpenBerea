import { type ChildProcess, spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, type Page, test } from '@playwright/test';

// Updates reach every device: a deploy is simulated by changing the build id in a copy of the site
// (dist-update/, data linked rather than copied), served on its own port by the same server as the
// other tests, which answers like Cloudflare.

const ROOT = join(__dirname, '..', '..');
const DIST = join(ROOT, process.env.DIST_DIR ?? 'dist');
const COPY = join(ROOT, 'dist-update');
const PORT = 4190;
const BASE = `http://localhost:${PORT}`;
const NEXT = 'b0000000000b';

let server: ChildProcess | null = null;
let original = { sw: '', html: '', build: '' };

/** Puts a build id on the copy, as a deploy would. */
function deploy(build: string) {
  const sw = original.sw.replace(`"shell":"${original.build}"`, `"shell":"${build}"`);
  const html = original.html.replace(`content="${original.build}"`, `content="${build}"`);
  writeFileSync(join(COPY, 'sw.js'), sw);
  writeFileSync(join(COPY, 'index.html'), html);
}

const pageBuild = (page: Page) =>
  page.evaluate(() => document.querySelector<HTMLMetaElement>('meta[name="openberea-build"]')?.content ?? null).catch(() => null);

/** The build the service worker in charge serves. */
const workerBuild = (page: Page) =>
  page
    .evaluate(
      () =>
        new Promise<string | null>((resolve) => {
          const sw = navigator.serviceWorker.controller;
          if (!sw) return resolve(null);
          const channel = new MessageChannel();
          channel.port1.onmessage = (e) => resolve(e.data?.build ?? null);
          sw.postMessage({ type: 'version' }, [channel.port2]);
          setTimeout(() => resolve(null), 2000);
        }),
    )
    .catch(() => null);

/** Opens a page and waits until the service worker controls it. */
async function openControlled(page: Page, path: string) {
  await page.goto(BASE + path);
  await page.getByTestId('main-menu-hint').waitFor();
  const controlled = () => page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 20_000 });
  await controlled().catch(async () => {
    await page.reload();
    await controlled();
  });
}

test.describe('updates', () => {
  test.describe.configure({ mode: 'serial', timeout: 90_000 });
  test.use({ serviceWorkers: 'allow' });

  test.beforeAll(async ({}, info) => {
    if (info.project.name !== 'desktop') return;
    rmSync(COPY, { recursive: true, force: true });
    mkdirSync(COPY);
    cpSync(DIST, COPY, { recursive: true, filter: (src) => src !== join(DIST, 'data') });
    symlinkSync(join(DIST, 'data'), join(COPY, 'data'));
    // These tests are about code updates; skip the 131 MB offline download each new browser starts.
    writeFileSync(join(COPY, 'precache.json'), JSON.stringify({ ...JSON.parse(readFileSync(join(DIST, 'precache.json'), 'utf8')), core: [] }));
    original.sw = readFileSync(join(COPY, 'sw.js'), 'utf8');
    original.html = readFileSync(join(COPY, 'index.html'), 'utf8');
    original.build = /name="openberea-build" content="([0-9a-f]+)"/.exec(original.html)![1];
    server = spawn(process.execPath, [join(ROOT, 'scripts', 'serve-dist.mjs')], { env: { ...process.env, DIST_DIR: 'dist-update', PORT: String(PORT) }, cwd: ROOT, stdio: 'ignore' });
    for (let i = 0; i < 50; i++) {
      if (await fetch(BASE).then((r) => r.ok).catch(() => false)) break;
      await new Promise((r) => setTimeout(r, 100));
    }
  });

  test.afterAll(() => {
    server?.kill();
    if (existsSync(COPY)) rmSync(COPY, { recursive: true, force: true });
  });

  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== 'desktop', 'one server; the update logic is the same at every size');
    deploy(original.build);
  });

  test('every page and the service worker carry the same build id', async ({ page }) => {
    await openControlled(page, '/');
    expect(await pageBuild(page)).toBe(original.build);
    expect(await workerBuild(page)).toBe(original.build);
  });

  test('a page opened after a deploy switches to the new build without reloading', async ({ page }) => {
    await openControlled(page, '/');
    deploy(NEXT);
    await page.goto(BASE + '/about');
    expect(await pageBuild(page)).toBe(NEXT);
    await expect.poll(() => workerBuild(page), { timeout: 20_000 }).toBe(NEXT);
    await expect(page.getByTestId('update-notice')).toHaveCount(0);
    await expect(page.getByTestId('updates')).toContainText(`version ${NEXT}`);
  });

  test('a page in use offers the update, and Reload switches to it', async ({ page }) => {
    await openControlled(page, '/about');
    await page.mouse.click(5, 5); // in use: no automatic reload
    deploy(NEXT);
    await page.getByTestId('check-updates').click();
    await expect(page.getByTestId('update-notice')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('update-status')).toHaveText('A new version is ready.');
    // Until then, the page keeps working on its own build.
    expect(await pageBuild(page)).toBe(original.build);
    await page.getByTestId('update-reload').click();
    await expect.poll(() => pageBuild(page), { timeout: 20_000 }).toBe(NEXT);
    await expect.poll(() => workerBuild(page), { timeout: 20_000 }).toBe(NEXT);
    await expect(page.getByTestId('update-notice')).toHaveCount(0);
  });

  test('"Not now" hides the notice for this visit', async ({ page }) => {
    await openControlled(page, '/about');
    await page.mouse.click(5, 5);
    deploy(NEXT);
    await page.getByTestId('check-updates').click();
    await page.getByTestId('update-dismiss').click();
    await expect(page.getByTestId('update-notice')).toHaveCount(0);
    expect(await pageBuild(page)).toBe(original.build);
  });

  test('right after opening, before anything is touched, an update applies by itself', async ({ page }) => {
    await openControlled(page, '/');
    deploy(NEXT);
    // Coming back into view checks for updates.
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect.poll(() => pageBuild(page), { timeout: 20_000 }).toBe(NEXT);
  });

  test('back after ten minutes away, an update applies by itself', async ({ page }) => {
    await page.clock.install();
    await openControlled(page, '/read/jhn/3');
    await page.mouse.click(5, 5); // was in use before leaving
    await page.evaluate(() => {
      const w = window as unknown as { hidden: boolean };
      w.hidden = true;
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (w.hidden ? 'hidden' : 'visible') });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.clock.fastForward('11:00');
    deploy(NEXT);
    await page.evaluate(() => {
      (window as unknown as { hidden: boolean }).hidden = false;
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect.poll(() => pageBuild(page), { timeout: 20_000 }).toBe(NEXT);
    await expect(page).toHaveURL(/\/read\/jhn\/3$/);
  });

  test('back after a short break, the page is not reloaded; the notice is offered instead', async ({ page }) => {
    await page.clock.install();
    await openControlled(page, '/read/jhn/3');
    await page.mouse.click(5, 5);
    await page.evaluate(() => {
      const w = window as unknown as { hidden: boolean };
      w.hidden = true;
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (w.hidden ? 'hidden' : 'visible') });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.clock.fastForward('02:00');
    deploy(NEXT);
    await page.evaluate(() => {
      (window as unknown as { hidden: boolean }).hidden = false;
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(page.getByTestId('update-notice')).toBeVisible({ timeout: 20_000 });
    expect(await pageBuild(page)).toBe(original.build);
  });

  test('a device on the first release moves to the current one on its next visit', async ({ page }) => {
    // The first release's worker: takes over at install and doesn't know about build ids.
    const current = JSON.parse(/const BUILD = (\{.*?\});/.exec(original.sw)![1]);
    const first = readFileSync(join(__dirname, 'fixtures', 'sw-first-release.js'), 'utf8').replace(
      'const BUILD = __BUILD__;',
      `const BUILD = ${JSON.stringify({ ...current, shell: 'a0000000000a' })};`,
    );
    writeFileSync(join(COPY, 'sw.js'), first);
    await openControlled(page, '/');
    expect(await workerBuild(page)).toBeNull();
    // Deploy the current release; the device's next visit picks it up without a prompt.
    deploy(original.build);
    await page.goto(BASE + '/about');
    expect(await pageBuild(page)).toBe(original.build);
    await expect.poll(() => workerBuild(page), { timeout: 20_000 }).toBe(original.build);
    await expect(page.getByTestId('update-notice')).toHaveCount(0);
    // The first release's cache is kept as "previous" for any page still running it.
    const names = await page.evaluate(() => caches.keys());
    expect(names).toEqual(expect.arrayContaining([`shell-${original.build}`, 'shell-a0000000000a']));
  });

  test("a missing script, data file, or icon (answered with the app's page, as the host does) is never stored", async ({ page, request }) => {
    const res = await request.get(`${BASE}/data/kjv/XYZ/1.json`);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('text/html');
    await openControlled(page, '/');
    const stored = await page.evaluate(async () => {
      const paths = ['/data/kjv/XYZ/1.json', '/_expo/static/js/web/entry-00000000.js', '/icons/missing.png'];
      for (const p of paths) await fetch(p);
      const found: string[] = [];
      for (const name of await caches.keys()) for (const p of paths) if (await (await caches.open(name)).match(p)) found.push(p);
      return found;
    });
    expect(stored).toEqual([]);
  });
});
