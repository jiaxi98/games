import { expect, test } from '@playwright/test';

const WORLD_WIDTH = 30;
const WORLD_HEIGHT = 18;
const SLING_ANCHOR = { x: 4.2, y: 14.15 };

function mapWorldToViewportBox(
  box: { x: number; y: number; width: number; height: number },
  point: { x: number; y: number },
): { x: number; y: number } {
  return {
    x: box.x + (point.x / WORLD_WIDTH) * box.width,
    y: box.y + (point.y / WORLD_HEIGHT) * box.height,
  };
}

test('launch flow reaches resolved and can restart', async ({ page }) => {
  await page.goto('/', { waitUntil: 'load' });

  await expect(page.locator('#state')).toHaveText('Idle');
  await expect(page.locator('#targets')).toHaveText('2');
  await expect(page.locator('#score')).toHaveText('0');

  const canvas = page.locator('#world');
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error('Canvas bounding box not available.');
  }

  const anchor = mapWorldToViewportBox(box, SLING_ANCHOR);
  await page.mouse.move(anchor.x, anchor.y);
  await page.mouse.down();
  const releasePoint = { x: anchor.x - 120, y: anchor.y + 55 };
  await page.mouse.move(releasePoint.x, releasePoint.y, { steps: 16 });
  await expect(page.locator('#state')).toHaveText('Aiming');
  await page.mouse.up();
  // Firefox headless can occasionally miss pointerup; dispatch a deterministic fallback.
  if ((await page.locator('#state').textContent())?.trim() === 'Aiming') {
    await page.locator('#world').dispatchEvent('pointerup', {
      clientX: releasePoint.x,
      clientY: releasePoint.y,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      bubbles: true,
    });
  }

  await expect(page.locator('#state')).toHaveText('Launched');
  await expect(page.locator('#round-message')).toHaveText('Flight in progress.');

  await expect(page.locator('#state')).toContainText('Resolved', { timeout: 28_000 });

  const endMessage = await page.locator('#round-message').textContent();
  expect(['All pigs eliminated.', 'No more effective motion.']).toContain(endMessage);

  await page.keyboard.press('r');
  await expect(page.locator('#state')).toHaveText('Idle');
  await expect(page.locator('#score')).toHaveText('0');
});
