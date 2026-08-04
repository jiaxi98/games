import { expect, test } from '@playwright/test';

test('initial scene visual baseline', async ({ page }) => {
  await page.goto('/', { waitUntil: 'load' });
  await page.waitForTimeout(250);
  await expect(page).toHaveScreenshot('initial-scene.png', {
    fullPage: true,
    animations: 'disabled',
  });
});
