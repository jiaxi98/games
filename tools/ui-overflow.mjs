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
  ?? 'artifacts/release-audit/ui-overflow';

const resolutions = [
  { id: 'desktop-1080p', width: 1920, height: 1080 },
  { id: 'desktop-900p', width: 1600, height: 900 },
  { id: 'laptop-768p', width: 1366, height: 768 },
  { id: 'compact-720p', width: 1280, height: 720 },
  { id: 'small-portrait', width: 768, height: 1024 },
];

const states = [
  {
    id: 'opening',
    prepare: () => {},
  },
  {
    id: 'captain',
    prepare: () => {
      const context = window.MedievalRPG.getContext();
      const gameplay = context.app.gameplay;
      gameplay.verify.recoverStandard();
      gameplay.verify.rally();
      gameplay.verify.breakLine();
      const debug = gameplay.getDebugState();
      const target = debug.landmarks.duelPoint ?? debug.landmarks.bridge;
      const position = target.clone();
      position.z += 8;
      position.y = context.app.world.sampleHeight(position.x, position.z) + 0.04;
      context.player.teleport(position, { yaw: 0, pitch: -0.04 });
    },
  },
  {
    id: 'victory',
    prepare: () => {
      const context = window.MedievalRPG.getContext();
      const gameplay = context.app.gameplay;
      gameplay.verify.recoverStandard();
      gameplay.verify.rally();
      gameplay.verify.breakLine();
      gameplay.verify.defeatCaptain();
      gameplay.verify.secureBridge();
    },
  },
];

await ensureDirectory(outputDirectory);
const browser = await launchReleaseBrowser();
const reportEntries = [];
const failures = [];

try {
  for (const resolution of resolutions) {
    for (const state of states) {
      const { page, runtimeIssues } = await createReleasePage(browser, {
        viewport: {
          width: resolution.width,
          height: resolution.height,
        },
      });
      try {
        await bootGame(page, { baseURL: DEFAULT_BASE_URL });
        await page.evaluate(state.prepare);
        if (state.id === 'captain') {
          await page.waitForFunction(() => (
            window.MedievalRPG.getContext().app.gameplay
              .getDebugState().encounters.captain?.active === true
          ), null, { timeout: 10_000 });
        }
        if (state.id === 'victory') await page.waitForTimeout(800);
        else await page.waitForTimeout(350);

        const scan = await page.evaluate(() => {
          const root = document.querySelector('.as-ui');
          const visible = [...document.querySelectorAll('.as-ui *')]
            .filter((element) => {
              const style = getComputedStyle(element);
              const rect = element.getBoundingClientRect();
              return (
                style.display !== 'none'
                && style.visibility !== 'hidden'
                && Number(style.opacity || 1) > 0
                && rect.width > 0
                && rect.height > 0
              );
            });
          const viewport = {
            width: document.documentElement.clientWidth,
            height: document.documentElement.clientHeight,
          };
          const overflow = visible.flatMap((element) => {
            const rect = element.getBoundingClientRect();
            const left = Math.max(0, -rect.left);
            const top = Math.max(0, -rect.top);
            const right = Math.max(0, rect.right - viewport.width);
            const bottom = Math.max(0, rect.bottom - viewport.height);
            if (Math.max(left, top, right, bottom) <= 1) return [];
            return [{
              selector: selectorFor(element),
              rect: {
                left: round(rect.left),
                top: round(rect.top),
                right: round(rect.right),
                bottom: round(rect.bottom),
                width: round(rect.width),
                height: round(rect.height),
              },
              overflow: {
                left: round(left),
                top: round(top),
                right: round(right),
                bottom: round(bottom),
              },
              text: element.textContent?.trim().replace(/\s+/g, ' ').slice(0, 120) ?? '',
            }];
          });
          return {
            viewport,
            root: root ? {
              clientWidth: root.clientWidth,
              clientHeight: root.clientHeight,
              rect: (() => {
                const rect = root.getBoundingClientRect();
                return {
                  left: round(rect.left),
                  top: round(rect.top),
                  right: round(rect.right),
                  bottom: round(rect.bottom),
                  width: round(rect.width),
                  height: round(rect.height),
                };
              })(),
            } : null,
            document: {
              scrollWidth: document.documentElement.scrollWidth,
              scrollHeight: document.documentElement.scrollHeight,
            },
            overflow,
          };

          function selectorFor(element) {
            if (element.id) return `#${element.id}`;
            if (element.dataset.ref) return `[data-ref="${element.dataset.ref}"]`;
            const classes = [...element.classList].slice(0, 2);
            return classes.length ? `.${classes.join('.')}` : element.tagName.toLowerCase();
          }

          function round(value) {
            return Math.round(value * 10) / 10;
          }
        });

        const screenshot = `${resolution.id}-${state.id}.png`;
        await captureScreenshot(page, join(outputDirectory, screenshot));
        const entryFailures = [];
        assertRelease(scan.root !== null, 'UI root was not mounted.', entryFailures);
        assertRelease(
          scan.document.scrollWidth <= scan.viewport.width + 1,
          `Document width overflowed by ${scan.document.scrollWidth - scan.viewport.width}px.`,
          entryFailures,
        );
        assertRelease(
          scan.document.scrollHeight <= scan.viewport.height + 1,
          `Document height overflowed by ${scan.document.scrollHeight - scan.viewport.height}px.`,
          entryFailures,
        );
        assertRelease(
          scan.root.rect.left >= -1
          && scan.root.rect.top >= -1
          && scan.root.rect.right <= scan.viewport.width + 1
          && scan.root.rect.bottom <= scan.viewport.height + 1,
          'UI root bounding box crossed the viewport.',
          entryFailures,
        );
        assertRelease(
          scan.overflow.length === 0,
          `${scan.overflow.length} visible UI element(s) crossed the viewport.`,
          entryFailures,
        );
        assertRelease(runtimeIssues.length === 0, 'Runtime warnings/errors were emitted.', entryFailures);
        failures.push(...entryFailures.map((failure) => (
          `${resolution.id}/${state.id}: ${failure}`
        )));
        reportEntries.push({
          resolution,
          state: state.id,
          screenshot,
          passed: entryFailures.length === 0,
          failures: entryFailures,
          runtimeIssues,
          scan,
        });
      } finally {
        await page.close();
      }
    }
  }

  const report = {
    schemaVersion: 1,
    audit: 'ui-overflow',
    baseURL: DEFAULT_BASE_URL,
    generatedAt: new Date().toISOString(),
    passed: failures.length === 0,
    failures,
    entries: reportEntries,
  };
  await writeJson(join(outputDirectory, 'report.json'), report);
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
} finally {
  await browser.close();
}
