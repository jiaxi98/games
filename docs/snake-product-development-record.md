# Snake Product Development Record

## Project Context

- Repository: `games`
- Game: `snake`
- Working branch: `feature/snake-game`
- Development date: February 6, 2026
- Developer mode: autonomous implementation with deferred user validation

## Product Goal

Build the first playable game in this repository with:

1. Clear and testable core gameplay loop
2. Stable browser runtime on remote server workflows
3. Basic automated quality gates
4. Documentation suitable for a beginner game development learner

## Planned Milestones

| Milestone | Target | Status |
|---|---|---|
| M0: repo baseline (main branch ready) | Create base branch for PR | Completed |
| M1: project scaffold | Vite + TypeScript setup | Completed |
| M2: movement + input | Reliable grid movement and steering | Completed |
| M3: MVP gameplay loop | Food, growth, game over, restart | Completed |
| M4: HUD + state UX | Score, high score, status, controls | Completed |
| M5: automated quality baseline | typecheck + unit tests + e2e smoke setup | Partially completed |
| M6: documentation package | dev record + learning notes + runbook | Completed |

## Delivery Summary

### 1. Repository and Branch Baseline

- Created `main` root commit and pushed to `origin/main`
- Rebuilt `feature/snake-game` from `main` to ensure clean PR ancestry

### 2. Implemented Game Features

In `snake/`:

- Canvas-based Snake game with grid rendering
- Direction input via `Arrow keys` and `W/A/S/D`
- Correct anti-reverse steering rule
- Food spawning that avoids snake body
- Score system and persistent high score (`localStorage`)
- Game phase model: `idle`, `running`, `paused`, `game_over`
- Difficulty selector (`easy` / `normal` / `hard`) with speed mapping
- Start, pause/resume, and restart controls
- Keyboard shortcuts: `Enter`, `Space`, `R`

### 3. Technical Architecture Decisions

#### A. Core rules separated from UI

- Pure rule engine in `snake/src/core/game.ts`
- State/type contracts in `snake/src/core/types.ts`
- Rendering/input orchestration in `snake/src/main.ts`

Why:

- Easier testing for game rules
- UI changes do not require rewriting core logic
- Better long-term maintainability for additional games

#### B. Fixed-step progression model

- Tick-based updates by difficulty (`SPEED_BY_DIFFICULTY`)

Why:

- Avoid frame-rate-dependent game speed
- Deterministic behavior for tests and debugging

#### C. Environment-safe npm setup

- Added `snake/.npmrc` with local cache + reduced socket parallelism

Why:

- Remote server had npm cache permission and EMFILE sensitivity
- Localized cache prevents global environment side effects

## Verification and Test Log

## Successful checks

- `npm run typecheck` passed
- `npm run test:unit` passed (7 tests)
- `npm run test:coverage` passed
- `npm run build` passed
- `npm run check` passed (`typecheck + unit`)

### Coverage result snapshot

- Statements: `89.06%`
- Branches: `82.92%`
- Functions: `80%`
- Lines: `88.33%`

Notes:

- Remaining uncovered branches are mostly defensive paths (error and rare-state branches)
- Current coverage is sufficient for MVP baseline and safe iterative expansion

### Unit test coverage focus

`snake/tests/unit/game.test.ts` validates:

- Initial state and valid food placement
- Direction queue constraints (no opposite turn)
- Movement progression
- Food consumption, growth, and scoring
- Wall collision handling
- Tail-cell movement edge case
- Full-board spawn behavior

## Known environment blocker

- `npm run test:e2e` currently fails on this server because Chromium headless shell requires missing shared library:
  - `libgbm.so.1`

Impact:

- Playwright smoke test is configured but cannot execute in this host image without additional system packages.

Resolution path:

1. Install host dependency (`libgbm1`) in server image
2. Re-run `npm run test:e2e`

This blocker is documented and does not prevent game functionality delivery.

## Deferred User Validation Items (Paused)

The following require your subjective feedback and were intentionally paused:

1. Speed feel tuning for each difficulty
2. Visual readability under your display/latency conditions
3. Keyboard responsiveness preference (turn buffer behavior)
4. HUD wording and control labeling preference

## Files Added/Updated (High-level)

- Root:
  - `README.md`
  - `.gitignore`
  - `docs/snake-product-development-record.md`
  - `docs/game-dev-experience-notes.md`
- Game project:
  - `snake/src/main.ts`
  - `snake/src/style.css`
  - `snake/src/core/game.ts`
  - `snake/src/core/types.ts`
  - `snake/tests/unit/game.test.ts`
  - `snake/tests/e2e/smoke.spec.ts`
  - `snake/playwright.config.ts`
  - `snake/vitest.config.ts`
  - `snake/package.json`
  - `snake/.npmrc`
  - `snake/README.md`

## Next Practical Steps After User Returns

1. Run quick manual playtest session (5-10 minutes)
2. Adjust difficulty speed constants from play feedback
3. Decide whether to install Playwright host dependencies on server
4. Open PR from `feature/snake-game` to `main` with this record attached
