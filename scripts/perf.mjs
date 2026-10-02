// Measures how fast a chapter opens, under Lighthouse's "slow 4G" network (150 ms RTT, 1.6 Mbps)
// and 4× CPU slowdown, in three situations:
//   cold    first visit, nothing cached
//   repeat  a later visit, after the service worker has saved the core data
//   in-app  moving to another chapter inside the app (next chapter, or a typed jump)
// Run against a built site served on :4173: node scripts/perf.mjs
import { chromium, devices } from '@playwright/test';

const BASE = process.env.BASE ?? 'http://localhost:4173';
const SLOW_4G = { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 };

async function throttle(page, on = true) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', on ? SLOW_4G : { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: on ? 4 : 1 });
  return cdp;
}

/** ms from navigation start until the given verse's text is on screen. */
async function openChapter(page, path, verseTestId = 'verse-1') {
  const t0 = Date.now();
  await page.goto(BASE + path, { waitUntil: 'commit' });
  await page.getByTestId(verseTestId).first().waitFor({ state: 'visible', timeout: 60_000 });
  return Date.now() - t0;
}

const results = [];
const browser = await chromium.launch();

for (const [label, device] of [['phone', devices['Pixel 7']], ['desktop', { viewport: { width: 1280, height: 800 } }]]) {
  // Cold first visit.
  {
    const context = await browser.newContext({ ...device, serviceWorkers: 'allow' });
    const page = await context.newPage();
    await throttle(page);
    results.push([label, 'cold first visit, John 3', await openChapter(page, '/read/jhn/3')]);
    await context.close();
  }
  // Repeat visit after the core data is saved.
  {
    const context = await browser.newContext({ ...device, serviceWorkers: 'allow' });
    const page = await context.newPage();
    await page.goto(BASE + '/read/jhn/1');
    await page.getByTestId('verse-1').waitFor();
    await page.waitForFunction(
      async () => {
        const r = await fetch('/precache.json');
        const { core } = await r.json();
        let n = 0;
        for (const name of await caches.keys()) if (name.startsWith('data-')) n += (await (await caches.open(name)).keys()).length;
        return n >= core.length;
      },
      null,
      { timeout: 600_000, polling: 3000 },
    );
    await throttle(page);
    for (const [name, path] of [['Romans 8', '/read/rom/8'], ['Psalm 119 (176 verses)', '/read/psa/119'], ['Genesis 1, Hebrew', '/read/gen/1?tr=orig']]) {
      const id = path.includes('orig') ? 'orig-verse-1' : 'verse-1';
      results.push([label, `repeat visit, ${name}`, await openChapter(page, path, id)]);
    }
    // In-app navigation (no page load): next chapter and a typed jump.
    await page.goto(BASE + '/read/jhn/3');
    await page.getByTestId('verse-1').waitFor();
    let t0 = Date.now();
    await page.getByTestId('next-chapter').click();
    await page.getByRole('heading', { name: 'John 4' }).waitFor();
    await page.getByTestId('verse-1').waitFor();
    results.push([label, 'in-app, next chapter', Date.now() - t0]);
    t0 = Date.now();
    await page.goto(BASE + '/?jump=1', { waitUntil: 'commit' });
    await page.getByTestId('quick-jump').fill('Isa 53');
    t0 = Date.now();
    await page.keyboard.press('Enter');
    await page.getByRole('heading', { name: 'Isaiah 53' }).waitFor();
    await page.getByTestId('verse-1').waitFor();
    results.push([label, 'in-app, typed jump (Isa 53)', Date.now() - t0]);
    await context.close();
  }
}
await browser.close();

console.log('\nChapter open times (slow 4G, 4× CPU slowdown):');
for (const [device, what, ms] of results) console.log(`  ${device.padEnd(8)} ${what.padEnd(34)} ${String(ms).padStart(6)} ms`);
