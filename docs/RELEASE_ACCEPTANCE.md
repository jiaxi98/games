# Formal release acceptance

Run the production build behind a local HTTP server, then execute:

```sh
npm run release:audit
```

`GAME_URL` defaults to `http://127.0.0.1:5173/`. Audit JSON and screenshots are
written below `artifacts/release-audit/`; the natural mission report is written
below `artifacts/natural-playtest/`.

## Blocking thresholds

- Build and Vitest suite pass with no browser console errors, page errors, or
  failed requests.
- Every route checkpoint captures at least 120 frames, has p95 frame time at or
  below 33.3 ms, and spends no more than 5% of sampled frames above 33.3 ms.
- Each checkpoint reports renderer draw calls/triangles, active squad IDs, LOD
  counts, visible sectors, and crowd capacity. Crowd count must equal expected
  count and must not be truncated.
- Captain audit runs each strategy twice with deterministic seed `1356`.
  Attack-only, fixed guard, reactive guard/backstep, and low-skill runs must all
  produce captain attacks, player attacks, the ordered `commanding → pressed →
  desperate` phase sequence, a living player, a defeated captain, and mission
  completion. Fixed/reactive guard must block or parry; reactive must complete a
  backstep; low-skill must take damage.
- UI overflow audit passes at 1920×1080, 1600×900, 1366×768, 1280×720, and
  768×1024 for opening HUD, captain HUD, and victory panel. No visible UI box
  may cross the viewport by more than 1 px and the document must not scroll.
- Natural mission automation must finish through production input only. Any call
  to `gameplay.verify` fails the run.

Environment overrides:

- `ARTIFACT_DIR` changes an individual command's output directory.
- `CHECKPOINT_WARMUP_MS` and `CHECKPOINT_SAMPLE_MS` tune checkpoint duration.
- `CAPTAIN_RUNS` changes deterministic repeats; release default is `2`.
- `CAPTAIN_STRATEGIES=attack-only,fixed-guard` runs a subset for iteration.
- `CHROME_PATH` selects the Chrome/Chromium executable.
