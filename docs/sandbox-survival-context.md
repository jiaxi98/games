# Sandbox Survival Context

## Snapshot

- Branch: `feature/3d-sandbox-survival`
- Active module: `sandbox-survival/`
- Engine stack: `Three.js + TypeScript + Vite`
- Test stack: `Vitest + Playwright(Firefox) + xvfb-run`
- Deterministic seed baseline: `20260207`

## Current Architecture

- `src/world/*`: chunk/world bootstrap, deterministic resource distribution.
- `src/gameplay/*`: player movement, inventory hotbar logic.
- `src/survival/*`: health/hunger/temperature/durability ticking.
- `src/persistence/*`: local save/load parser and storage adapter.
- `src/contracts/*`: shared data contracts across streams.
- `src/main.ts`: runtime composition and scene wiring.

## Runtime Controls

- Move: `W/A/S/D`, Sprint: `Shift`
- Look: mouse after viewport click (pointer lock) or arrow keys fallback
- Gather: `E`
- Place selected resource block: `Q`
- Switch slot: `1` (wood), `2` (stone)
- Save/Load: `K` / `L` or HUD buttons

## Contracts Between Parallel Streams

- World stream outputs deterministic `resourceNodes` + `worldBounds`.
- Gameplay stream consumes world data, emits inventory + placement events.
- Survival stream consumes movement/placement context and emits status metrics.
- Persistence stream snapshots `player + inventory + survival + harvested + placed`.

## Command Reference

- Local module checks:
  - `cd sandbox-survival && npm run typecheck`
  - `cd sandbox-survival && npm run test:unit`
  - `cd sandbox-survival && npm run test:integration`
  - `cd sandbox-survival && xvfb-run -a npm run test:e2e`
- Container full gate:
  - `bash scripts/test-in-container.sh --app-dir sandbox-survival`
