import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseURL = process.env.GAME_URL ?? 'http://127.0.0.1:5173/';
const outputDirectory = process.env.ARTIFACT_DIR ?? 'artifacts/visual-smoke';
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

try {
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.MedievalRPG?.getContext?.());
  await page.waitForTimeout(1_500);

  const boot = await page.evaluate(() => {
    const context = window.MedievalRPG.getContext();
    return {
      state: context.state.value,
      extensions: context.app.extensions.list(),
      world: Boolean(context.app.world),
      battlefield: Boolean(context.app.battlefield),
      presentation: Boolean(context.app.presentation),
      combat: Boolean(context.app.playerCombat),
    };
  });

  await page.screenshot({
    path: `${outputDirectory}/opening.png`,
    fullPage: true,
  });

  await page.evaluate(() => {
    const context = window.MedievalRPG.getContext();
    context.state.transition('playing');
  });
  await page.waitForTimeout(1_500);
  await page.screenshot({
    path: `${outputDirectory}/spawn.png`,
    fullPage: true,
  });

  const landmarks = ['meleeLane', 'hedgerowRally', 'spearLine', 'burningMill', 'bridge'];
  for (const landmark of landmarks) {
    const available = await page.evaluate((name) => {
      const context = window.MedievalRPG.getContext();
      const world = context.app.world;
      const target = world?.landmarks?.[name];
      if (!world || !target) return false;
      const position = target.clone();
      if (name === 'spearLine') position.z += 30;
      if (name === 'bridge') position.z += 44;
      position.y = world.sampleHeight(position.x, position.z) + 0.04;
      context.player.teleport(position, { yaw: 0, pitch: -0.03 });
      return true;
    }, landmark);
    if (!available) continue;
    await page.waitForTimeout(650);
    await page.screenshot({
      path: `${outputDirectory}/${landmark}.png`,
      fullPage: true,
    });
  }

  const metrics = await page.evaluate(() => {
    const context = window.MedievalRPG.getContext();
    const renderer = context.renderer;
    return {
      renderer: {
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        points: renderer.info.render.points,
        lines: renderer.info.render.lines,
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
      },
      battle: context.app.battlefield?.getState?.() ?? null,
      narrative: context.app.presentation?.narrative?.getState?.() ?? null,
    };
  });

  const missionFlow = await page.evaluate(() => {
    const gameplay = window.MedievalRPG.getContext().app.gameplay;
    if (!gameplay?.verify) return null;
    const stages = [gameplay.getState().stage];
    gameplay.verify.recoverStandard();
    stages.push(gameplay.getState().stage);
    gameplay.verify.rally();
    stages.push(gameplay.getState().stage);
    gameplay.verify.breakLine();
    stages.push(gameplay.getState().stage);
    gameplay.verify.defeatCaptain();
    stages.push(gameplay.getState().stage);
    gameplay.verify.secureBridge();
    stages.push(gameplay.getState().stage);
    return {
      stages,
      state: gameplay.getState(),
      playerEnabled: window.MedievalRPG.getContext().player.enabled,
    };
  });
  await page.waitForTimeout(350);
  await page.screenshot({
    path: `${outputDirectory}/victory.png`,
    fullPage: true,
  });

  console.log(JSON.stringify({ boot, metrics, missionFlow, runtimeIssues }, null, 2));
  if (!boot.world || !boot.battlefield || !boot.presentation || !boot.combat) {
    process.exitCode = 1;
  }
  const expectedStages = ['recover', 'rally', 'break', 'captain', 'victory', 'won'];
  if (JSON.stringify(missionFlow?.stages) !== JSON.stringify(expectedStages)) {
    process.exitCode = 1;
  }
  if (runtimeIssues.length > 0) process.exitCode = 1;
} finally {
  await browser.close();
}
