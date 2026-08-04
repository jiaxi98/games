import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

export const DEFAULT_BASE_URL = process.env.GAME_URL ?? 'http://127.0.0.1:5173/';
export const DEFAULT_CHROME_PATH =
  process.env.CHROME_PATH
  ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

export const RELEASE_VIEWPORT = Object.freeze({
  width: 1600,
  height: 900,
});

export async function ensureDirectory(path) {
  await mkdir(path, { recursive: true });
  return path;
}

export async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

export async function launchReleaseBrowser() {
  return chromium.launch({
    headless: true,
    executablePath: DEFAULT_CHROME_PATH,
    args: [
      '--use-angle=metal',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
    ],
  });
}

export async function createReleasePage(browser, {
  viewport = RELEASE_VIEWPORT,
  deviceScaleFactor = 1,
} = {}) {
  const page = await browser.newPage({
    viewport,
    deviceScaleFactor,
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
    runtimeIssues.push(
      `[requestfailed] ${request.url()} ${request.failure()?.errorText ?? ''}`,
    );
  });
  return { page, runtimeIssues };
}

export async function bootGame(page, {
  baseURL = DEFAULT_BASE_URL,
  enter = true,
} = {}) {
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.MedievalRPG?.getContext?.());
  await page.waitForFunction(() => {
    const context = window.MedievalRPG.getContext();
    return Boolean(
      context.app.world
      && context.app.battlefield
      && context.app.gameplay
      && context.app.playerCombat
      && context.app.presentation,
    );
  });
  if (!enter) return;
  await page.click('#enter-game');
  await page.waitForFunction(() => (
    window.MedievalRPG.getContext().state.value === 'playing'
  ));
}

export async function waitForStage(page, stage, timeout = 8_000) {
  await page.waitForFunction(
    (expected) => (
      window.MedievalRPG.getContext().app.gameplay.getState().stage === expected
    ),
    stage,
    { timeout },
  );
}

export async function face(page, target) {
  await page.evaluate(({ x, y, z }) => {
    const context = window.MedievalRPG.getContext();
    const dx = x - context.player.position.x;
    const dz = z - context.player.position.z;
    context.player.yaw = Math.atan2(-dx, -dz);
    const horizontal = Math.max(0.001, Math.hypot(dx, dz));
    const eyeY = context.player.position.y + context.player.eyeHeight;
    context.player.pitch = Math.max(
      -0.5,
      Math.min(0.35, Math.atan2(y - eyeY, horizontal)),
    );
  }, target);
  await page.waitForTimeout(80);
}

export async function walkTo(page, target, {
  threshold,
  timeout,
  sprint = true,
} = {}) {
  const begin = Date.now();
  let lastDistance = Infinity;
  let stalledFor = 0;
  if (sprint) await page.keyboard.down('Shift');
  await page.keyboard.down('w');
  try {
    while (Date.now() - begin < timeout) {
      await face(page, target);
      const distance = await distanceTo(page, target);
      if (distance <= threshold) return Date.now() - begin;
      if (Math.abs(lastDistance - distance) < 0.035) stalledFor += 1;
      else stalledFor = 0;
      lastDistance = distance;
      if (stalledFor > 8) {
        await page.keyboard.up('w');
        const side = stalledFor % 2 ? 'a' : 'd';
        await page.keyboard.down(side);
        await page.waitForTimeout(350);
        await page.keyboard.up(side);
        await page.keyboard.down('w');
        stalledFor = 0;
      }
      await page.waitForTimeout(120);
    }
  } finally {
    await page.keyboard.up('w').catch(() => {});
    if (sprint) await page.keyboard.up('Shift').catch(() => {});
  }
  throw new Error(
    `Timed out walking to ${JSON.stringify(target)}; last distance ${lastDistance.toFixed(2)}`,
  );
}

export async function distanceTo(page, target) {
  return page.evaluate(({ x, z }) => {
    const position = window.MedievalRPG.getContext().player.position;
    return Math.hypot(position.x - x, position.z - z);
  }, target);
}

export async function getMissionRoute(page) {
  return page.evaluate(() => {
    const context = window.MedievalRPG.getContext();
    const state = context.app.gameplay.getDebugState();
    return {
      standard: vector(state.standardPosition),
      rally: vector(state.landmarks.hedgerowRally),
      spearLine: vector(state.landmarks.spearLine),
      bridge: vector(state.landmarks.bridge),
      standardRaise: vector(state.landmarks.standardRaise ?? state.landmarks.bridge),
      duelPoint: vector(state.landmarks.duelPoint ?? state.landmarks.bridge),
    };

    function vector(value) {
      return { x: value.x, y: value.y, z: value.z };
    }
  });
}

export async function progressToCaptain(page, {
  capture = null,
} = {}) {
  const route = await getMissionRoute(page);
  const timings = {};

  timings.toStandard = await walkTo(page, route.standard, {
    threshold: 2.65,
    timeout: 38_000,
  });
  await face(page, route.standard);
  await page.keyboard.press('e');
  await waitForStage(page, 'rally');
  await capture?.('01-standard-recovered');

  timings.toRally = await walkTo(page, route.rally, {
    threshold: 6,
    timeout: 30_000,
  });
  for (let index = 0; index < 3; index += 1) {
    await page.keyboard.press('q');
    await page.waitForTimeout(180);
  }
  await waitForStage(page, 'break');
  await capture?.('02-hedgerow-rallied');

  timings.toSpearLine = await walkTo(page, route.spearLine, {
    threshold: 12,
    timeout: 36_000,
  });
  await page.keyboard.press('r');
  await page.waitForTimeout(220);
  for (let index = 0; index < 3; index += 1) {
    await page.keyboard.press('f');
    await page.waitForTimeout(220);
  }
  await waitForStage(page, 'captain');
  await capture?.('03-spear-line-broken');

  timings.toCaptain = await approachCaptainEncounter(page, route);
  return { route, timings };
}

export async function approachCaptainEncounter(page, route = null) {
  const missionRoute = route ?? await getMissionRoute(page);
  const start = Date.now();
  while (Date.now() - start < 32_000) {
    const state = await getCaptainState(page);
    if (state.targetable && state.alive) return Date.now() - start;
    const approach = {
      x: missionRoute.bridge.x,
      y: missionRoute.bridge.y,
      z: missionRoute.bridge.z + 52,
    };
    const distance = await distanceTo(page, approach);
    if (distance > 8) {
      await walkTo(page, approach, {
        threshold: 6.5,
        timeout: 12_000,
      });
    } else {
      await page.waitForTimeout(250);
    }
  }
  throw new Error('Captain encounter did not activate after approaching the bridge perimeter');
}

export async function getCaptainState(page) {
  return page.evaluate(() => {
    const context = window.MedievalRPG.getContext();
    const gameplay = context.app.gameplay;
    const captain = gameplay.getCaptain();
    const encounters = gameplay.getDebugState().encounters;
    return {
      active: encounters.captain?.active ?? false,
      phase: encounters.captain?.phase ?? null,
      targetable: captain?.combatant?.targetable ?? false,
      alive: captain?.combatant?.alive ?? false,
      health: captain?.combatant?.health ?? 0,
      maxHealth: captain?.combatant?.maxHealth ?? 0,
      position: captain ? {
        x: captain.object3d.position.x,
        y: captain.object3d.position.y + 1.25,
        z: captain.object3d.position.z,
      } : null,
      playerHealth: context.app.playerCombat.combatant.health,
      playerMaxHealth: context.app.playerCombat.combatant.maxHealth,
      playerAlive: context.app.playerCombat.combatant.alive,
      stage: gameplay.getState().stage,
      combatStats: gameplay.getDebugState().combatStats,
    };
  });
}

export async function finishAtBridge(page, route = null) {
  const missionRoute = route ?? await getMissionRoute(page);
  const stage = await page.evaluate(() => (
    window.MedievalRPG.getContext().app.gameplay.getState().stage
  ));
  if (stage !== 'victory' && stage !== 'won') {
    await waitForStage(page, 'victory', 20_000);
  }
  if (stage === 'won') return;
  await walkTo(page, missionRoute.bridge, {
    threshold: 15,
    timeout: 30_000,
  });
  await page.evaluate(() => {
    const context = window.MedievalRPG.getContext();
    const landmarks = context.app.gameplay.getDebugState().landmarks;
    const interaction = landmarks.standardRaise ?? landmarks.bridge;
    const approach = interaction.clone();
    approach.z += 7;
    approach.y = context.app.world.sampleHeight(approach.x, approach.z) + 0.04;
    context.player.teleport(approach, { yaw: 0, pitch: -0.08 });
  });
  await face(page, missionRoute.standardRaise);
  await page.keyboard.press('e');
  await waitForStage(page, 'won');
  await page.waitForTimeout(800);
}

export async function installCaptainTelemetry(page) {
  await page.evaluate(() => {
    const context = window.MedievalRPG.getContext();
    const now = () => Math.round(performance.now() * 10) / 10;
    const store = {
      attacks: [],
      impacts: [],
      defenses: [],
      damage: [],
      evades: [],
      playerStrikes: [],
      phases: [],
      secondWind: 0,
    };
    window.__RELEASE_CAPTAIN_TELEMETRY__ = store;
    window.__RELEASE_CAPTAIN_TELEMETRY_OFF__ = [
      context.events.on('battlefield:ai-attack', ({ actor, target, attack, weapon }) => {
        if (
          actor?.role === 'captain'
        ) {
          store.attacks.push({
            t: now(),
            attack: attack?.id ?? attack?.name ?? null,
            weapon: weapon ?? null,
            target: target?.role ?? target?.id ?? null,
          });
        }
      }),
      context.events.on('battlefield:ai-impact', ({ actor, target, result }) => {
        if (
          actor?.role === 'captain'
        ) {
          store.impacts.push({
            t: now(),
            outcome: result?.outcome ?? null,
            damage: result?.damage ?? 0,
            target: target?.role ?? target?.id ?? null,
          });
        }
      }),
      context.events.on('player:defense', ({ outcome, staminaDamage, attacker }) => {
        if (attacker?.actor?.role === 'captain' || attacker?.role === 'captain') {
          store.attacks.push({
            t: now(),
            attack: 'defense-contact',
            weapon: attacker?.actor?.weapon ?? attacker?.weapon ?? null,
          });
        }
        store.defenses.push({
          t: now(),
          outcome: outcome ?? null,
          staminaDamage: staminaDamage ?? 0,
        });
      }),
      context.events.on('player:damage', ({ outcome, amount }) => {
        store.damage.push({
          t: now(),
          outcome: outcome ?? null,
          amount: amount ?? 0,
        });
      }),
      context.events.on('player:evade', ({ phase, displacement }) => {
        if (phase === 'complete') {
          store.evades.push({
            t: now(),
            displacement: displacement ?? 0,
          });
        }
      }),
      context.events.on('combat:swing', ({ attack, weapon }) => {
        store.playerStrikes.push({
          t: now(),
          attack: attack?.id ?? attack?.name ?? null,
          weapon: weapon ?? null,
        });
      }),
      context.events.on('player:second-wind', () => {
        store.secondWind += 1;
      }),
      context.events.on('encounter:captain', ({ visible, phase, health, maxHealth }) => {
        if (!visible || !phase) return;
        const previous = store.phases.at(-1);
        if (previous?.phase === phase) return;
        store.phases.push({
          t: now(),
          phase,
          health: health ?? null,
          maxHealth: maxHealth ?? null,
        });
      }),
    ];
  });
}

export async function readCaptainTelemetry(page) {
  return page.evaluate(() => {
    const store = window.__RELEASE_CAPTAIN_TELEMETRY__;
    return store ? JSON.parse(JSON.stringify(store)) : null;
  });
}

export async function disposeCaptainTelemetry(page) {
  await page.evaluate(() => {
    for (const dispose of window.__RELEASE_CAPTAIN_TELEMETRY_OFF__ ?? []) dispose?.();
    delete window.__RELEASE_CAPTAIN_TELEMETRY_OFF__;
    delete window.__RELEASE_CAPTAIN_TELEMETRY__;
  });
}

export async function captureScreenshot(page, path) {
  await page.waitForTimeout(250);
  await page.screenshot({ path, fullPage: true });
}

export function assertRelease(condition, message, failures) {
  if (!condition) failures.push(message);
  return condition;
}

export function summarizeCounts(values, key = 'outcome') {
  return values.reduce((counts, value) => {
    const name = value?.[key] ?? 'unknown';
    counts[name] = (counts[name] ?? 0) + 1;
    return counts;
  }, {});
}
