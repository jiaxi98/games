import { join } from 'node:path';
import {
  DEFAULT_BASE_URL,
  assertRelease,
  bootGame,
  createReleasePage,
  disposeCaptainTelemetry,
  distanceTo,
  ensureDirectory,
  face,
  finishAtBridge,
  getCaptainState,
  getMissionRoute,
  installCaptainTelemetry,
  launchReleaseBrowser,
  readCaptainTelemetry,
  summarizeCounts,
  waitForStage,
  walkTo,
  writeJson,
} from './release-audit-lib.mjs';

const outputDirectory =
  process.env.ARTIFACT_DIR
  ?? 'artifacts/release-audit/captain-strategies';
const runsPerStrategy = positiveInteger(process.env.CAPTAIN_RUNS, 2);
const strategyFilter = new Set(
  (process.env.CAPTAIN_STRATEGIES ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
);

const strategies = [
  {
    id: 'attack-only',
    description: 'Continuous basic attacks; never guards or evades.',
    timeoutMs: 35_000,
    async act({ page, state, iteration }) {
      await closeDistance(page, state.position);
      await face(page, state.position);
      await page.mouse.click(800, 450);
      await page.waitForTimeout(iteration % 3 === 2 ? 720 : 560);
    },
    validate({ telemetry, failures }) {
      assertRelease(
        telemetry.defenses.length === 0,
        'attack-only: unexpected defense outcome.',
        failures,
      );
      assertRelease(
        telemetry.evades.length === 0,
        'attack-only: unexpected evade outcome.',
        failures,
      );
    },
  },
  {
    id: 'fixed-guard',
    description: 'Fixed guard/attack cadence without reading captain telegraphs.',
    timeoutMs: 50_000,
    async act({ page, state }) {
      await closeDistance(page, state.position);
      await face(page, state.position);
      await page.mouse.down({ button: 'right' });
      await page.waitForTimeout(1_350);
      await page.mouse.up({ button: 'right' });
      await page.waitForTimeout(120);
      await page.mouse.click(800, 450);
      await page.waitForTimeout(620);
    },
    validate({ telemetry, failures }) {
      const defenses = summarizeCounts(telemetry.defenses);
      assertRelease(
        (defenses.blocked ?? 0) + (defenses.parried ?? 0) >= 1,
        'fixed-guard: no blocked or parried captain attack was observed.',
        failures,
      );
    },
  },
  {
    id: 'reactive-guard-backstep',
    description: 'Responds to captain attack starts with a backstep and held guard.',
    timeoutMs: 45_000,
    createState: () => ({ handledAttacks: 0 }),
    async act({ page, state, local }) {
      await closeDistance(page, state.position);
      await face(page, state.position);
      const attackCount = await page.evaluate(() => (
        window.__RELEASE_CAPTAIN_TELEMETRY__?.attacks.length ?? 0
      ));
      if (attackCount > local.handledAttacks) {
        local.handledAttacks = attackCount;
        await page.keyboard.down('s');
        await page.keyboard.press('AltLeft');
        await page.keyboard.up('s');
        await page.mouse.down({ button: 'right' });
        await page.waitForTimeout(1_150);
        await page.mouse.up({ button: 'right' });
        await page.waitForTimeout(120);
        return;
      }
      await page.mouse.click(800, 450);
      await page.waitForTimeout(580);
    },
    validate({ telemetry, failures }) {
      const defenses = summarizeCounts(telemetry.defenses);
      assertRelease(
        (defenses.blocked ?? 0) + (defenses.parried ?? 0) >= 1,
        'reactive-guard-backstep: no blocked or parried captain attack was observed.',
        failures,
      );
      assertRelease(
        telemetry.evades.length >= 1,
        'reactive-guard-backstep: no completed backstep was observed.',
        failures,
      );
    },
  },
  {
    id: 'low-skill',
    description: 'Slow attacks, late short guards, and no telegraph reaction.',
    timeoutMs: 55_000,
    async act({ page, state, iteration }) {
      await closeDistance(page, state.position, 3.1);
      await face(page, state.position);
      await page.waitForTimeout(650);
      if (iteration % 4 === 3) {
        await page.mouse.down({ button: 'right' });
        await page.waitForTimeout(260);
        await page.mouse.up({ button: 'right' });
      }
      await page.mouse.click(800, 450);
      await page.waitForTimeout(1_050);
    },
    validate({ telemetry, failures }) {
      const damage = summarizeCounts(telemetry.damage);
      assertRelease(
        (damage.hit ?? 0) + (damage.stagger ?? 0) + (damage['guard-broken'] ?? 0) >= 1,
        'low-skill: run did not demonstrate a damaging captain outcome.',
        failures,
      );
    },
  },
].filter(({ id }) => strategyFilter.size === 0 || strategyFilter.has(id));

if (strategies.length === 0) {
  throw new Error('CAPTAIN_STRATEGIES did not match a known strategy.');
}

await ensureDirectory(outputDirectory);
const browser = await launchReleaseBrowser();
const results = [];
const globalFailures = [];

try {
  for (const strategy of strategies) {
    for (let run = 1; run <= runsPerStrategy; run += 1) {
      const result = await runStrategy(browser, strategy, run);
      results.push(result);
      globalFailures.push(...result.failures.map((failure) => (
        `${strategy.id} run ${run}: ${failure}`
      )));
      await writeJson(
        join(outputDirectory, `${strategy.id}-run-${run}.json`),
        result,
      );
    }
  }

  for (const strategy of strategies) {
    const strategyResults = results.filter((result) => result.strategy === strategy.id);
    const signatures = new Set(strategyResults.map((result) => JSON.stringify({
      completed: result.final?.stage ?? null,
      phases: result.phaseSequence,
      playerAlive: result.final?.playerAlive ?? null,
      captainAlive: result.final?.captainAlive ?? null,
    })));
    assertRelease(
      signatures.size === 1,
      `${strategy.id}: deterministic runs disagreed on terminal state or phase sequence.`,
      globalFailures,
    );
  }

  const report = {
    schemaVersion: 1,
    audit: 'captain-strategies',
    baseURL: DEFAULT_BASE_URL,
    generatedAt: new Date().toISOString(),
    deterministicSeed: 1356,
    runsPerStrategy,
    strategies: strategies.map(({ id, description }) => ({ id, description })),
    passed: globalFailures.length === 0,
    failures: globalFailures,
    results,
  };
  await writeJson(join(outputDirectory, 'report.json'), report);
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
} finally {
  await browser.close();
}

async function runStrategy(browser, strategy, run) {
  const { page, runtimeIssues } = await createReleasePage(browser);
  const failures = [];
  const startedAt = Date.now();
  let telemetry = null;
  let final = null;
  let iterations = 0;

  try {
    await bootGame(page, { baseURL: DEFAULT_BASE_URL });
    await page.evaluate(() => {
      const gameplay = window.MedievalRPG.getContext().app.gameplay;
      gameplay.verify.recoverStandard();
      gameplay.verify.rally();
      gameplay.verify.breakLine();
    });
    await waitForStage(page, 'captain');
    await installCaptainTelemetry(page);
    const route = await getMissionRoute(page);
    await page.evaluate(() => {
      const context = window.MedievalRPG.getContext();
      const target = context.app.gameplay.getDebugState().landmarks.duelPoint
        ?? context.app.gameplay.getDebugState().landmarks.bridge;
      const position = target.clone();
      position.z += 8;
      position.y = context.app.world.sampleHeight(position.x, position.z) + 0.04;
      context.player.teleport(position, { yaw: 0, pitch: -0.04 });
    });
    await page.waitForFunction(() => (
      window.MedievalRPG.getContext().app.gameplay
        .getDebugState().encounters.captain?.active === true
    ), null, { timeout: 10_000 });

    const local = strategy.createState?.() ?? {};
    const combatStartedAt = Date.now();
    while (Date.now() - combatStartedAt < strategy.timeoutMs) {
      const state = await getCaptainState(page);
      if (!state.alive) break;
      if (!state.playerAlive) {
        failures.push('player died before captain completion.');
        break;
      }
      if (!state.position) {
        await page.waitForTimeout(120);
        continue;
      }
      await strategy.act({
        page,
        state,
        local,
        iteration: iterations,
      });
      iterations += 1;
    }

    const captainAfterCombat = await getCaptainState(page);
    assertRelease(
      !captainAfterCombat.alive,
      'captain remained alive at strategy timeout.',
      failures,
    );
    if (!captainAfterCombat.alive && captainAfterCombat.playerAlive) {
      await finishAtBridge(page, route);
    }
    telemetry = await readCaptainTelemetry(page);
    final = await getCaptainState(page);
    const integrity = await page.evaluate(() => (
      window.MedievalRPG.getContext().app.battlefieldSimulation
        ?.getTelemetrySnapshot?.() ?? null
    ));

    const phaseSequence = telemetry.phases.map(({ phase }) => phase);
    assertRelease(
      telemetry.attacks.length >= 1,
      'no captain attack start was observed.',
      failures,
    );
    assertRelease(
      telemetry.playerStrikes.length >= 1,
      'no player attack was observed.',
      failures,
    );
    assertRelease(
      includesOrderedSubsequence(
        phaseSequence,
        ['commanding', 'pressed', 'desperate'],
      ),
      `captain phases were incomplete: ${phaseSequence.join(', ') || 'none'}.`,
      failures,
    );
    assertRelease(
      final.stage === 'won',
      `mission did not complete; terminal stage was ${final.stage}.`,
      failures,
    );
    assertRelease(final.playerAlive, 'player was not alive at completion.', failures);
    assertRelease(!final.alive, 'captain was alive at completion.', failures);
    assertRelease(
      integrity?.actors?.targetLosses === 0,
      `target integrity reported ${integrity?.actors?.targetLosses ?? 'missing'} losses.`,
      failures,
    );
    assertRelease(
      integrity?.crowd?.truncated === false
      && integrity?.crowd?.countMismatch === false
      && integrity?.crowd?.capacityShortfall === 0,
      'crowd telemetry reported truncation, mismatch, or capacity shortfall.',
      failures,
    );
    strategy.validate({ telemetry, final, failures });
    assertRelease(runtimeIssues.length === 0, 'runtime warnings/errors were emitted.', failures);

    return {
      schemaVersion: 1,
      strategy: strategy.id,
      description: strategy.description,
      run,
      deterministicSeed: 1356,
      durationMs: Date.now() - startedAt,
      iterations,
      passed: failures.length === 0,
      failures,
      runtimeIssues,
      phaseSequence,
      outcomeCounts: {
        defenses: summarizeCounts(telemetry.defenses),
        damage: summarizeCounts(telemetry.damage),
        impacts: summarizeCounts(telemetry.impacts),
      },
      final: {
        stage: final.stage,
        playerAlive: final.playerAlive,
        playerHealth: final.playerHealth,
        playerMaxHealth: final.playerMaxHealth,
        captainAlive: final.alive,
        captainHealth: final.health,
        combatStats: final.combatStats,
      },
      integrity,
      telemetry,
    };
  } catch (error) {
    failures.push(error instanceof Error ? error.stack ?? error.message : String(error));
    return {
      schemaVersion: 1,
      strategy: strategy.id,
      description: strategy.description,
      run,
      deterministicSeed: 1356,
      durationMs: Date.now() - startedAt,
      iterations,
      passed: false,
      failures,
      runtimeIssues,
      phaseSequence: telemetry?.phases?.map(({ phase }) => phase) ?? [],
      final,
      telemetry,
    };
  } finally {
    await page.mouse.up({ button: 'right' }).catch(() => {});
    await disposeCaptainTelemetry(page).catch(() => {});
    await page.close();
  }
}

async function closeDistance(page, target, threshold = 2.7) {
  const distance = await distanceTo(page, target);
  if (distance <= threshold) return;
  await walkTo(page, target, {
    threshold,
    timeout: 8_000,
    sprint: false,
  });
}

function includesOrderedSubsequence(values, expected) {
  let index = 0;
  for (const value of values) {
    if (value === expected[index]) index += 1;
  }
  return index === expected.length;
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
