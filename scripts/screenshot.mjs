// Screenshot helper for design review: node scripts/screenshot.mjs <url> <out.png> [desktop|phone] [actions…]
import { chromium, devices } from '@playwright/test';
const [,, url, out, device = 'desktop', ...actions] = process.argv;
const browser = await chromium.launch();
const ctx = await browser.newContext(device === 'phone' ? { ...devices['Pixel 7'] } : { viewport: { width: 1280, height: 800 } , colorScheme: process.env.SCHEME || 'light'});
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log('console error:', m.text().slice(0, 300)); });
page.on('pageerror', (e) => console.log('page error:', e.message.slice(0, 300)));
await page.goto(url, { waitUntil: 'networkidle' });
for (const a of actions) {
  const [kind, ...rest] = a.split(':');
  if (kind === 'wait') await page.waitForTimeout(Number(rest[0]));
  if (kind === 'click') await page.getByTestId(rest[0]).click();
  if (kind === 'press') await page.keyboard.press(rest[0]);
  if (kind === 'type') await page.keyboard.type(rest.join(':'));
  if (kind === 'mouse') { const [x, y] = rest.map(Number); await page.mouse.move(x, y); }
  if (kind === 'down') await page.mouse.down();
  if (kind === 'up') await page.mouse.up();
}
await page.screenshot({ path: out, fullPage: false });
await browser.close();
