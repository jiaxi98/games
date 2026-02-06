import { expect, test } from '@playwright/test';

test('basic game shell and controls work', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Grid Snake' })).toBeVisible();
  await expect(page.getByTestId('status')).toHaveText('Idle');

  await page.getByTestId('start-button').click();
  await expect(page.getByTestId('status')).toHaveText('Running');

  await page.getByTestId('pause-button').click();
  await expect(page.getByTestId('status')).toHaveText('Paused');

  await page.keyboard.press('Space');
  await expect(page.getByTestId('status')).toHaveText('Running');

  await expect(page.getByTestId('game-canvas')).toBeVisible();
});
