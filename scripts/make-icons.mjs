// Renders assets/brand/icon.svg to the PNG icons used by the web app manifest and favicon.
// Run once after changing the icon: node scripts/make-icons.mjs
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const svg = readFileSync('assets/brand/icon.svg', 'utf8');
const sizes = { 'public/icons/icon-512.png': 512, 'public/icons/icon-192.png': 192, 'public/icons/apple-touch-icon.png': 180, 'assets/images/icon.png': 1024, 'assets/images/favicon.png': 48 };
const browser = await chromium.launch();
for (const [out, size] of Object.entries(sizes)) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<html><body style="margin:0">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: out, omitBackground: false });
  await page.close();
  console.log(out, size);
}
await browser.close();
