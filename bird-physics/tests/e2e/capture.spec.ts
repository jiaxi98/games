import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

test('capture latest scene screenshot artifact', async ({ page }) => {
  await page.goto('/', { waitUntil: 'load' });
  await page.waitForTimeout(250);

  const outputDir = path.resolve(process.cwd(), 'artifacts/screenshots');
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, 'latest-scene.png');
  await page.screenshot({ path: outputPath, fullPage: true });

  expect(fs.existsSync(outputPath)).toBe(true);
});
