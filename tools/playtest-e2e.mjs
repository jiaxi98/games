import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseURL = process.env.GAME_URL ?? 'http://127.0.0.1:5173/';
const outputDirectory = process.env.ARTIFACT_DIR ?? 'artifacts/natural-playtest';
const executablePath =
  process.env.CHROME_PATH ??
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath,
  args: ['--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({
  viewport: { width: 1600, height: 900 },
  deviceScaleFactor: 1,
});

const runtimeIssues = [];
page.on('console', (message) => {
  if (message.type() === 'error' || message.type() === 'warning') {
    runtimeIssues.push(`[console:${message.type()}] ${message.text()}`);
  }
});
page.on('pageerror', (error) => {
  runtimeIssues.push(`[pageerror] ${error.stack ?? error.message}`);
});
page.on('requestfailed', (request) => {
  runtimeIssues.push(`[requestfailed] ${request.url()} ${request.failure()?.errorText ?? ''}`);
});

const timings = {};
const startedAt = Date.now();

try {
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.MedievalRPG?.getContext?.());
  await page.click('#enter-game');
  await page.waitForFunction(() => (
    window.MedievalRPG.getContext().state.value === 'playing'
  ));

  await capture('00-opening');
  const debug = await page.evaluate(() => {
    const context = window.MedievalRPG.getContext();
    const state = context.app.gameplay.getDebugState();
    return {
      standard: vector(state.standardPosition),
      rally: vector(state.landmarks.hedgerowRally),
      spearLine: vector(state.landmarks.spearLine),
      bridge: vector(state.landmarks.bridge),
    };

    function vector(value) {
      return { x: value.x, y: value.y, z: value.z };
    }
  });

  timings.toStandard = await walkTo(debug.standard, 2.65, 38_000);
  await face(debug.standard);
  await page.keyboard.press('e');
  await waitForStage('rally');
  await capture('01-standard-recovered');

  timings.toRally = await walkTo(debug.rally, 6, 30_000);
  for (let index = 0; index < 3; index += 1) {
    await page.keyboard.press('q');
    await page.waitForTimeout(180);
  }
  await waitForStage('break');
  await capture('02-hedgerow-rallied');

  timings.toSpearLine = await walkTo(debug.spearLine, 12, 36_000);
  await page.keyboard.press('r');
  await page.waitForTimeout(220);
  for (let index = 0; index < 3; index += 1) {
    await page.keyboard.press('f');
    await page.waitForTimeout(220);
  }
  await waitForStage('captain');
  await capture('03-spear-line-broken');

  const combat = await fightCaptain();
  await waitForStage('victory', 12_000);
  await capture('04-captain-defeated');

  timings.toBridge = await walkTo(debug.bridge, 6.5, 30_000);
  await face(debug.bridge);
  await page.keyboard.press('e');
  await waitForStage('won');
  await page.waitForTimeout(800);
  await capture('05-victory');

  const final = await page.evaluate(() => {
    const context = window.MedievalRPG.getContext();
    return {
      mission: context.app.gameplay.getState(),
      player: {
        health: context.app.playerCombat.combatant.health,
        enabled: context.player.enabled,
        position: vector(context.player.position),
      },
      performance: context.app.getPerformanceSnapshot(),
      title: document.querySelector('.as-panel-title')?.textContent?.trim() ?? '',
      actions: [...document.querySelectorAll('.as-button-row button')]
        .map((button) => button.textContent?.trim()),
    };

    function vector(value) {
      return { x: value.x, y: value.y, z: value.z };
    }
  });

  const report = {
    elapsedMs: Date.now() - startedAt,
    timings,
    combat,
    final,
    runtimeIssues,
  };
  await writeFile(
    `${outputDirectory}/report.json`,
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(JSON.stringify(report, null, 2));

  if (
    final.mission.stage !== 'won'
    || final.player.enabled !== false
    || final.title !== 'The Standard Rises'
    || combat.strikes < 1
    || runtimeIssues.length
  ) {
    process.exitCode = 1;
  }
} finally {
  await browser.close();
}

async function waitForStage(stage, timeout = 8_000) {
  await page.waitForFunction(
    (expected) => window.MedievalRPG.getContext().app.gameplay.getState().stage === expected,
    stage,
    { timeout },
  );
}

async function face(target) {
  await page.evaluate(({ x, y, z }) => {
    const context = window.MedievalRPG.getContext();
    const dx = x - context.player.position.x;
    const dz = z - context.player.position.z;
    context.player.yaw = Math.atan2(-dx, -dz);
    const horizontal = Math.max(0.001, Math.hypot(dx, dz));
    const eyeY = context.player.position.y + context.player.eyeHeight;
    context.player.pitch = Math.max(-0.5, Math.min(0.35, Math.atan2(y - eyeY, horizontal)));
  }, target);
  await page.waitForTimeout(80);
}

async function walkTo(target, threshold, timeout) {
  const begin = Date.now();
  let lastDistance = Infinity;
  let stalledFor = 0;
  await page.keyboard.down('Shift');
  await page.keyboard.down('w');
  try {
    while (Date.now() - begin < timeout) {
      await face(target);
      const distance = await page.evaluate(({ x, z }) => {
        const position = window.MedievalRPG.getContext().player.position;
        return Math.hypot(position.x - x, position.z - z);
      }, target);
      if (distance <= threshold) return Date.now() - begin;
      if (Math.abs(lastDistance - distance) < 0.035) stalledFor += 1;
      else stalledFor = 0;
      lastDistance = distance;
      if (stalledFor > 8) {
        await page.keyboard.up('w');
        await page.keyboard.down(stalledFor % 2 ? 'a' : 'd');
        await page.waitForTimeout(350);
        await page.keyboard.up(stalledFor % 2 ? 'a' : 'd');
        await page.keyboard.down('w');
        stalledFor = 0;
      }
      await page.waitForTimeout(120);
    }
  } finally {
    await page.keyboard.up('w').catch(() => {});
    await page.keyboard.up('Shift').catch(() => {});
  }
  throw new Error(`Timed out walking to ${JSON.stringify(target)}; last distance ${lastDistance.toFixed(2)}`);
}

async function fightCaptain() {
  const start = Date.now();
  let strikes = 0;
  let landed = 0;
  let previousHealth = Infinity;

  while (Date.now() - start < 40_000) {
    const state = await page.evaluate(() => {
      const context = window.MedievalRPG.getContext();
      const captain = context.app.gameplay.getCaptain();
      return {
        alive: captain?.combatant?.alive ?? false,
        health: captain?.combatant?.health ?? 0,
        position: captain ? {
          x: captain.object3d.position.x,
          y: captain.object3d.position.y + 1.25,
          z: captain.object3d.position.z,
        } : null,
        playerHealth: context.app.playerCombat.combatant.health,
        playerAlive: context.app.playerCombat.combatant.alive,
      };
    });
    if (!state.alive) {
      return {
        durationMs: Date.now() - start,
        strikes,
        landed,
        playerHealth: state.playerHealth,
      };
    }
    if (!state.playerAlive) throw new Error('Player died during captain playtest');
    if (state.health < previousHealth) landed += 1;
    previousHealth = state.health;

    const distance = await page.evaluate(({ x, z }) => {
      const position = window.MedievalRPG.getContext().player.position;
      return Math.hypot(position.x - x, position.z - z);
    }, state.position);
    if (distance > 1.7) {
      await walkTo(state.position, 1.45, 4_000);
    }
    await face(state.position);
    await page.mouse.click(800, 450);
    strikes += 1;
    await page.waitForTimeout(670);
  }
  throw new Error(`Captain remained alive after ${strikes} production-input strikes`);
}

async function capture(name) {
  await page.waitForTimeout(250);
  await page.screenshot({
    path: `${outputDirectory}/${name}.png`,
    fullPage: true,
  });
}

