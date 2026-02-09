import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { firefox } from '@playwright/test';

const MAP_KEYS = ['wildlands', 'tiananmen', 'yiheyuan'];
const HOST = '127.0.0.1';
const PORT = 4173;
const BASE_URL = `http://${HOST}:${PORT}`;
const READY_PATTERN = /^ready/i;

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function parsePosition(text) {
  const match = text.match(/x:([-\d.]+)\s+y:([-\d.]+)\s+z:([-\d.]+)/);
  if (!match) {
    return null;
  }

  return {
    x: Number.parseFloat(match[1]),
    y: Number.parseFloat(match[2]),
    z: Number.parseFloat(match[3]),
  };
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function toFixed(value, digits = 2) {
  return Number.isFinite(value) ? value.toFixed(digits) : 'n/a';
}

async function waitForServer(url, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { method: 'GET' });
      if (response.ok) {
        return;
      }
      lastError = new Error(`Server responded with status ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await sleep(250);
  }

  throw new Error(`Timed out waiting for ${url}: ${String(lastError)}`);
}

async function collectForMap(page, mapKey) {
  const startAt = Date.now();
  await page.goto(`${BASE_URL}/?map=${mapKey}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    (pattern) => {
      const text = document.querySelector('#renderer-status')?.textContent?.trim() ?? '';
      return new RegExp(pattern, 'i').test(text);
    },
    READY_PATTERN.source,
    { timeout: 20000 },
  );
  const startupMs = Date.now() - startAt;

  const rendererStatus = await page.locator('#renderer-status').innerText();
  const heading = await page.locator('.hero p').innerText();
  const fps = await page.evaluate(async () => {
    const deltas = [];
    let frames = 0;
    let last = performance.now();
    return await new Promise((resolve) => {
      const step = (ts) => {
        if (frames > 0) {
          deltas.push(ts - last);
        }
        last = ts;
        frames += 1;
        if (frames >= 121) {
          const total = deltas.reduce((sum, item) => sum + item, 0);
          const avgDelta = total / Math.max(deltas.length, 1);
          const minDelta = Math.min(...deltas);
          const maxDelta = Math.max(...deltas);
          resolve({
            avgFps: 1000 / avgDelta,
            minFps: 1000 / maxDelta,
            maxFps: 1000 / minDelta,
          });
          return;
        }
        window.requestAnimationFrame(step);
      };
      window.requestAnimationFrame(step);
    });
  });

  const renderMetrics = await page.evaluate(() => {
    return window.__sandboxDebug?.getRenderMetrics() ?? null;
  });

  const travelNodes = await page.evaluate(() => {
    return window.__sandboxDebug?.getTravelNodes() ?? [];
  });
  const surfaceNode = travelNodes.find((node) => node.layer === 'surface') ?? null;

  let transportOk = false;
  let transportMessage = 'no surface travel node';
  if (surfaceNode) {
    await page.evaluate((position) => {
      window.__sandboxDebug?.setPlayerPosition({ x: position.x, z: position.z });
    }, surfaceNode.position);
    await page.waitForTimeout(80);

    const beforeText = await page.locator('#player-position').innerText();
    const before = parsePosition(beforeText);

    await page.keyboard.press('f');
    await page.waitForTimeout(180);

    const afterText = await page.locator('#player-position').innerText();
    const after = parsePosition(afterText);
    const statusText = await page.locator('#interaction-status').innerText();

    if (before && after && distance(before, after) > 0.6 && statusText.includes('->')) {
      transportOk = true;
    }
    transportMessage = statusText;
  }

  await page.evaluate(() => {
    window.__sandboxDebug?.setPlayerPosition({ x: -8, z: -4 });
  });
  await page.waitForTimeout(80);
  const savedPosition = await page.locator('#player-position').innerText();
  await page.keyboard.press('k');
  await page.waitForTimeout(80);
  const saveStatus = await page.locator('#interaction-status').innerText();

  await page.evaluate(() => {
    window.__sandboxDebug?.setPlayerPosition({ x: 12, z: 10 });
  });
  await page.waitForTimeout(80);
  await page.keyboard.press('l');
  await page.waitForFunction(
    (expected) => (document.querySelector('#player-position')?.textContent ?? '').trim() === expected,
    savedPosition,
    { timeout: 10000 },
  );
  const loadStatus = await page.locator('#interaction-status').innerText();
  const finalPosition = await page.locator('#player-position').innerText();
  const saveLoadOk = saveStatus.includes('saved') && finalPosition === savedPosition && loadStatus.includes('loaded');

  return {
    mapKey,
    heading,
    startupMs,
    rendererStatus,
    fps,
    renderMetrics,
    mapSwitchOk: READY_PATTERN.test(rendererStatus),
    transportOk,
    transportMessage,
    saveLoadOk,
    saveStatus,
    loadStatus,
  };
}

function renderMarkdown({ generatedAt, commit, environment, results }) {
  const header = [
    '# Sandbox Survival Baseline Report',
    '',
    `- Generated At: ${generatedAt}`,
    `- Commit: \`${commit}\``,
    `- Environment: ${environment}`,
    '',
    '## Scope',
    '',
    '- Baseline freeze for current playable build before Part 1 architecture split.',
    '- Metrics include startup time, FPS, draw calls, map switching, F-transport, and save/load.',
    '',
    '## Metrics',
    '',
    '| Map | Startup (ms) | Avg FPS | Min FPS | Max FPS | Renderer | Draw Calls | Triangles | Map Switch | F Transport | Save/Load |',
    '| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | --- | --- | --- |',
  ];

  const rows = results.map((item) => {
    const drawCalls = item.renderMetrics?.drawCalls ?? null;
    const triangles = item.renderMetrics?.triangles ?? null;
    return `| ${item.mapKey} | ${item.startupMs} | ${toFixed(item.fps.avgFps)} | ${toFixed(item.fps.minFps)} | ${toFixed(item.fps.maxFps)} | ${item.rendererStatus} | ${drawCalls ?? 'n/a'} | ${triangles ?? 'n/a'} | ${item.mapSwitchOk ? 'PASS' : 'FAIL'} | ${item.transportOk ? 'PASS' : 'FAIL'} | ${item.saveLoadOk ? 'PASS' : 'FAIL'} |`;
  });

  const details = [
    '',
    '## Notes',
    '',
    '- `drawCalls` and `triangles` are `n/a` when running in fallback renderer mode (no WebGL context).',
    '- F-transport check uses a nearby surface transport node and verifies teleport message/position change.',
    '- Save/Load check writes map-scoped slot then reloads and validates position restoration.',
    '',
    '## Map Details',
    '',
    ...results.map(
      (item) =>
        `- ${item.mapKey}: ${item.heading}; transport message: "${item.transportMessage}"; save="${item.saveStatus}", load="${item.loadStatus}"`,
    ),
    '',
  ];

  return [...header, ...rows, ...details].join('\n');
}

async function main() {
  const projectDir = process.cwd();
  const repoRoot = path.resolve(projectDir, '..');
  const docsDir = path.join(repoRoot, 'docs');
  await mkdir(docsDir, { recursive: true });

  const commitProcess = spawn('git', ['rev-parse', '--short', 'HEAD'], {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  let commit = '';
  for await (const chunk of commitProcess.stdout) {
    commit += String(chunk);
  }
  commit = commit.trim() || 'unknown';

  const devServer = spawn('npm', ['run', 'dev', '--', '--host', HOST, '--port', String(PORT), '--strictPort'], {
    cwd: projectDir,
    stdio: 'pipe',
    env: { ...process.env, FORCE_COLOR: '0' },
  });
  let devLogs = '';
  devServer.stdout.on('data', (chunk) => {
    devLogs += String(chunk);
  });
  devServer.stderr.on('data', (chunk) => {
    devLogs += String(chunk);
  });

  const shutdown = () => {
    if (!devServer.killed) {
      devServer.kill('SIGTERM');
    }
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  try {
    await waitForServer(BASE_URL);
    const browser = await firefox.launch({ headless: true });
    const results = [];

    for (const mapKey of MAP_KEYS) {
      const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
      results.push(await collectForMap(page, mapKey));
      await page.close();
    }

    await browser.close();

    const generatedAt = new Date().toISOString();
    const report = renderMarkdown({
      generatedAt,
      commit,
      environment: `firefox headless @ ${BASE_URL}`,
      results,
    });

    const reportPath = path.join(docsDir, 'sandbox-survival-baseline.md');
    const jsonPath = path.join(docsDir, 'sandbox-survival-baseline.json');
    await writeFile(reportPath, report, 'utf8');
    await writeFile(
      jsonPath,
      JSON.stringify({ generatedAt, commit, environment: `firefox headless @ ${BASE_URL}`, results }, null, 2),
      'utf8',
    );

    // Keep stdout concise for CI/operator readability.
    console.log(`Baseline report written: ${reportPath}`);
    console.log(`Baseline raw metrics: ${jsonPath}`);
  } catch (error) {
    throw new Error(`Baseline collection failed: ${String(error)}\n--- dev server logs ---\n${devLogs}`);
  } finally {
    shutdown();
  }
}

await main();
