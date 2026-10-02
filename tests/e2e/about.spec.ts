import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import type { DataManifest } from '../../src/lib/data/types';
import { expectAccessible, gotoApp, swipe } from './helpers';

const manifest = JSON.parse(readFileSync(join(__dirname, '..', '..', 'public', 'data', 'manifest.json'), 'utf8')) as DataManifest;

test.describe('About and credits', () => {
  test('credits every source with the attribution its license requires', async ({ page }) => {
    await gotoApp(page, '/about');
    await expect(page.getByRole('heading', { name: 'About OpenBerea' })).toBeVisible();
    expect(manifest.sources.length).toBeGreaterThanOrEqual(20);
    for (const s of manifest.sources) {
      const row = page.getByTestId(`source-${s.id}`);
      await expect(row, s.id).toContainText(s.license.attribution);
      await expect(row, s.id).toContainText(s.license.name);
    }
    await expect(page.getByTestId('source-stepbible')).toContainText('STEP Bible');
    await expect(page.getByTestId('source-theographic')).toContainText('CC BY-SA 4.0');
    await expectAccessible(page, 'about');
  });

  test('credits featured teachers and linked sites as their terms require', async ({ page }) => {
    await gotoApp(page, '/about');
    const t = page.getByTestId('teacher-credits');
    await expect(t).toContainText('By John Piper. © Desiring God Foundation. Source: desiringGod.org');
    await expect(t).toContainText('John Piper is founder and teacher of desiringGod.org');
    await expect(t).toContainText('Grace to You');
    await expect(t).toContainText('www.heartcrymissionary.com');
    await expect(t).toContainText('Blue Letter Bible: linked only');
  });

  test('explains what was left out and why', async ({ page }) => {
    await gotoApp(page, '/about');
    const x = page.getByTestId('excluded');
    for (const name of ['Gill', 'TBESH', 'Barnes', 'Thayer', 'Gesenius', 'pronunciation']) await expect(x).toContainText(name);
  });

  test('opens from the Resources menu', async ({ page }) => {
    await gotoApp(page, '/read/jhn/1');
    await swipe(page, 'main-menu', ['resources', 'res.about']);
    await expect(page).toHaveURL(/\/about$/);
  });
});
