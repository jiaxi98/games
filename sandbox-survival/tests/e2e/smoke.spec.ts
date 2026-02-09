import { expect, test } from '@playwright/test';

test('completes gather/place/save/load gameplay loop', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Sandbox Survival Prototype' })).toBeVisible();
  await expect(page.locator('#viewport canvas')).toBeVisible();
  await expect(page.getByTestId('renderer-status')).toContainText('ready');

  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(260);
  await page.keyboard.up('ArrowUp');

  await page.keyboard.press('e');

  await expect
    .poll(async () => Number.parseInt(await page.getByTestId('inventory-wood').innerText(), 10))
    .toBeGreaterThanOrEqual(2);

  await page.keyboard.press('q');
  await expect(page.getByTestId('structure-count')).toHaveText('1');

  const savedPosition = await page.getByTestId('player-position').innerText();
  const savedWood = await page.getByTestId('inventory-wood').innerText();
  const savedStructures = await page.getByTestId('structure-count').innerText();

  await page.keyboard.press('k');
  await expect(page.getByTestId('interaction-status')).toContainText('saved');

  await page.keyboard.down('d');
  await page.waitForTimeout(420);
  await page.keyboard.up('d');

  await expect
    .poll(async () => page.getByTestId('player-position').innerText())
    .not.toBe(savedPosition);

  await page.keyboard.press('q');

  await expect
    .poll(async () => Number.parseInt(await page.getByTestId('structure-count').innerText(), 10))
    .toBeGreaterThanOrEqual(2);

  await page.keyboard.press('l');

  await expect.poll(async () => page.getByTestId('player-position').innerText()).toBe(savedPosition);
  await expect.poll(async () => page.getByTestId('inventory-wood').innerText()).toBe(savedWood);
  await expect.poll(async () => page.getByTestId('structure-count').innerText()).toBe(savedStructures);
});

test('handles downed state and recovery', async ({ page }) => {
  await page.goto('/');

  await page.evaluate(() => {
    window.__sandboxDebug?.setSurvival({ health: 0, hunger: 0, temperature: 18, durability: 0 });
  });

  await expect(page.getByTestId('survival-state')).toHaveText('downed');

  await page.keyboard.press('e');
  await expect(page.getByTestId('interaction-status')).toContainText('downed');

  await page.keyboard.press('r');

  await expect(page.getByTestId('survival-state')).not.toHaveText('downed');
  await expect
    .poll(async () => Number.parseFloat(await page.getByTestId('health-value').innerText()))
    .toBeGreaterThan(40);
});

test('recovers from corrupted save payload', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('sandbox-survival:slot-1:wildlands', '{"version":');
  });

  await page.goto('/');
  await expect(page.getByTestId('interaction-status')).toContainText('save reset');

  const keys = await page.evaluate(() => Object.keys(window.localStorage));
  expect(keys).not.toContain('sandbox-survival:slot-1:wildlands');
  expect(keys.some((key) => key.startsWith('sandbox-survival:slot-1:wildlands:corrupt:'))).toBeTruthy();

  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(260);
  await page.keyboard.up('ArrowUp');

  await page.keyboard.press('e');
  await expect
    .poll(async () => Number.parseInt(await page.getByTestId('inventory-wood').innerText(), 10))
    .toBeGreaterThanOrEqual(2);
});

test('loads map presets and keeps map-scoped save slots', async ({ page }) => {
  const maps = [
    { key: 'wildlands', heading: 'Wildlands Frontier' },
    { key: 'tiananmen', heading: 'Tiananmen Inspired Plaza' },
    { key: 'yiheyuan', heading: 'Summer Palace Inspired Garden' },
  ];

  for (const map of maps) {
    await page.goto(`/?map=${map.key}`);
    await expect(page.locator('.hero p')).toContainText(map.heading);

    await page.keyboard.press('k');
    await expect(page.getByTestId('interaction-status')).toContainText('saved');

    const hasScopedKey = await page.evaluate((key) => {
      return window.localStorage.getItem(`sandbox-survival:slot-1:${key}`) !== null;
    }, map.key);
    expect(hasScopedKey).toBeTruthy();
  }

  const scopedKeys = await page.evaluate(() =>
    Object.keys(window.localStorage).filter((key) => key.startsWith('sandbox-survival:slot-1:')),
  );
  expect(scopedKeys).toEqual(expect.arrayContaining(maps.map((map) => `sandbox-survival:slot-1:${map.key}`)));
});

test('cycles map preset via next-map controls', async ({ page }) => {
  await page.goto('/?map=wildlands');
  await expect(page.locator('.hero p')).toContainText('Wildlands Frontier');

  await page.keyboard.press('m');
  await expect
    .poll(() => new URL(page.url()).searchParams.get('map'))
    .toBe('tiananmen');
  await expect(page.locator('.hero p')).toContainText('Tiananmen Inspired Plaza');

  await page.getByRole('button', { name: 'Next Map' }).click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get('map'))
    .toBe('yiheyuan');
  await expect(page.locator('.hero p')).toContainText('Summer Palace Inspired Garden');
});
