import { expect, test } from '@playwright/test';

import { expectAccessible, gotoApp, swipe } from './helpers';

test.describe('audio Bible', () => {
  test('Listen opens a chapter player with the LibriVox recording', async ({ page }) => {
    await gotoApp(page, '/read/rom/8');
    await swipe(page, 'main-menu', ['read', 'read.listen']);
    const bar = page.getByTestId('audio-bar');
    await expect(bar).toBeVisible();
    await expect(bar).toContainText('Listen: Romans 8 (KJV)');
    await expect(bar.locator('audio')).toHaveAttribute('src', /^https:\/\/archive\.org\/download\/.+\.mp3$/);
    await expect(bar.locator('audio')).toHaveAttribute('preload', 'none');
    await expect(bar).toContainText('LibriVox');
    await expect(bar).toContainText('no verse timings');
    await expectAccessible(page, 'audio bar');
    await page.getByTestId('next-chapter').click();
    await expect(page.getByTestId('audio-bar')).toContainText('Romans 9');
    await page.getByTestId('audio-close').click();
    await expect(page.getByTestId('audio-bar')).toHaveCount(0);
  });

  test('multi-chapter recordings say where the chapter is', async ({ page }) => {
    await gotoApp(page, '/read/gen/3');
    await swipe(page, 'main-menu', ['read', 'read.listen']);
    await expect(page.getByTestId('audio-bar')).toContainText('starts partway through');
  });
});
