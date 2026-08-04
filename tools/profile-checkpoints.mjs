import { join } from 'node:path';
import {
  DEFAULT_BASE_URL,
  assertRelease,
  bootGame,
  captureScreenshot,
  createReleasePage,
  ensureDirectory,
  launchReleaseBrowser,
  writeJson,
} from './release-audit-lib.mjs';

const outputDirectory =
  process.env.ARTIFACT_DIR
  ?? 'artifacts/release-audit/checkpoints';
const warmupMs = numberFromEnv('CHECKPOINT_WARMUP_MS', 1_000);
const sampleMs = numberFromEnv('CHECKPOINT_SAMPLE_MS', 3_000);
const failOnBudget = process.env.PROFILE_FAIL_ON_BUDGET !== '0';

const checkpoints = [
  {
    id: 'spawn',
    expectedStage: 'recover',
    landmark: 'playerStart',
    offset: { x: 0, z: 0 },
  },
  {
    id: 'melee',
    expectedStage: 'recover',
    landmark: 'meleeLane',
    offset: { x: 0, z: 18 },
  },
  {
    id: 'rally',
    expectedStage: 'rally',
    landmark: 'hedgerowRally',
    offset: { x: 3, z: 15 },
    advance: 'recoverStandard',
  },
  {
    id: 'spear',
    expectedStage: 'break',
    landmark: 'spearLine',
    offset: { x: 0, z: 34 },
    advance: 'rally',
  },
  {
    id: 'captain',
    expectedStage: 'captain',
    landmark: 'duelPoint',
    offset: { x: 0, z: 14 },
    advance: 'breakLine',
  },
  {
    id: 'bridge',
    expectedStage: 'victory',
    landmark: 'bridge',
    offset: { x: 0, z: 10 },
    advance: 'defeatCaptain',
  },
];

await ensureDirectory(outputDirectory);
const browser = await launchReleaseBrowser();
const { page, runtimeIssues } = await createReleasePage(browser);
const failures = [];
const results = [];

try {
  await bootGame(page, { baseURL: DEFAULT_BASE_URL });
  for (const checkpoint of checkpoints) {
    if (checkpoint.advance) {
      await page.evaluate((method) => {
        window.MedievalRPG.getContext().app.gameplay.verify[method]();
      }, checkpoint.advance);
    }
    const positioned = await page.evaluate(({ landmark, offset }) => {
      const context = window.MedievalRPG.getContext();
      const world = context.app.world;
      const target = world.landmarks[landmark];
      if (!target) return null;
      const position = target.clone();
      position.x += offset.x;
      position.z += offset.z;
      position.y = world.sampleHeight(position.x, position.z) + 0.04;
      const dx = target.x - position.x;
      const dz = target.z - position.z;
      context.player.teleport(position, {
        yaw: Math.atan2(-dx, -dz),
        pitch: -0.04,
      });
      return {
        stage: context.app.gameplay.getState().stage,
        position: { x: position.x, y: position.y, z: position.z },
      };
    }, checkpoint);

    assertRelease(
      positioned?.stage === checkpoint.expectedStage,
      `${checkpoint.id}: expected stage ${checkpoint.expectedStage}, got ${positioned?.stage}`,
      failures,
    );
    await page.evaluate(({ id, expectedStage }) => {
      window.MedievalRPG.getContext().app.startPerformanceCheckpoint(id, {
        stage: expectedStage,
      });
    }, checkpoint);
    await page.waitForTimeout(warmupMs + sampleMs);
    const snapshot = await page.evaluate(({ id, expectedStage, sampleMs: duration }) => (
      window.MedievalRPG.getContext().app.capturePerformanceCheckpoint(null, {
        stage: expectedStage,
        metadata: { durationMs: duration, audit: 'formal-release' },
      })
    ), {
      id: checkpoint.id,
      expectedStage: checkpoint.expectedStage,
      sampleMs,
    });

    await captureScreenshot(page, join(outputDirectory, `${checkpoint.id}.png`));
    const checkpointFailures = validateCheckpoint(snapshot, checkpoint.id);
    failures.push(...checkpointFailures);
    results.push({
      id: checkpoint.id,
      expectedStage: checkpoint.expectedStage,
      position: positioned.position,
      screenshot: `${checkpoint.id}.png`,
      failures: checkpointFailures,
      metrics: snapshot,
    });
  }

  assertRelease(runtimeIssues.length === 0, 'Runtime warnings/errors were emitted.', failures);
  const report = {
    schemaVersion: 1,
    audit: 'stage-checkpoints',
    baseURL: DEFAULT_BASE_URL,
    generatedAt: new Date().toISOString(),
    configuration: { warmupMs, sampleMs },
    passed: failures.length === 0,
    failures,
    runtimeIssues,
    checkpoints: results,
  };
  await writeJson(join(outputDirectory, 'report.json'), report);
  console.log(JSON.stringify(report, null, 2));
  if (failOnBudget && !report.passed) process.exitCode = 1;
} finally {
  await browser.close();
}

function validateCheckpoint(snapshot, label) {
  const checkpointFailures = [];
  assertRelease(snapshot.frames >= 120, `${label}: fewer than 120 sampled frames.`, checkpointFailures);
  assertRelease(snapshot.p95Ms <= 33.3, `${label}: p95 frame time exceeded 33.3ms.`, checkpointFailures);
  assertRelease(snapshot.over33Ratio <= 0.05, `${label}: >33.3ms frame ratio exceeded 5%.`, checkpointFailures);
  assertRelease(
    snapshot.renderer?.drawCalls > 0,
    `${label}: renderer draw calls were not captured.`,
    checkpointFailures,
  );
  assertRelease(
    snapshot.renderer?.triangles > 0,
    `${label}: renderer triangle count was not captured.`,
    checkpointFailures,
  );
  assertRelease(
    snapshot.simulation?.activeSquads >= 1,
    `${label}: no active squad telemetry was captured.`,
    checkpointFailures,
  );
  assertRelease(
    snapshot.simulation?.lod?.total > 0,
    `${label}: LOD telemetry was empty.`,
    checkpointFailures,
  );
  assertRelease(
    snapshot.simulation?.crowd?.expectedCount === snapshot.simulation?.crowd?.count,
    `${label}: crowd count did not match expected count.`,
    checkpointFailures,
  );
  assertRelease(
    snapshot.simulation?.crowd?.truncated === false,
    `${label}: crowd telemetry reported truncation.`,
    checkpointFailures,
  );
  assertRelease(
    snapshot.visibility?.visibleSectorCount > 0,
    `${label}: no visible sectors were reported.`,
    checkpointFailures,
  );
  return checkpointFailures;
}

function numberFromEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}
