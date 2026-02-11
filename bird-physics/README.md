# Bird Physics

Single-scene slingshot physics game inspired by Angry Birds style interactions.

## Scope

- One scene
- One bird
- Physics-focused gameplay:
  - gravity
  - damping (air-drag approximation)
  - friction
  - inelastic collision response
  - angular velocity and torque from rigid body collisions
  - impulse-based structural damage

## Run

```bash
npm install
npm run dev
```

## Controls

- Pointer drag on bird: aim
- Pointer release: launch
- `R`: restart round

## Scripts

- `npm run dev`
- `npm run typecheck`
- `npm run test:unit`
- `npm run test:integration`
- `npm run test:coverage`
- `npm run test:e2e` (Firefox end-to-end regression)
- `npm run test:e2e:host` (host-stable Firefox regression for current server)
- `npm run test:e2e:update` (update visual baseline snapshot)
- `npm run test:e2e:capture` (save latest scene screenshot to `artifacts/screenshots/latest-scene.png`)
- `npm run build`
- `npm run check`

## Browser Test Policy

- This project uses `Playwright + Firefox` for repeatable headless validation on the current server.
- Chromium is currently blocked by a host-level ICU mmap issue in this environment.
- E2E scripts enable `DEBUG=pw:browser` by default to avoid Firefox process pipe stalls observed on this host.
- On this server, Firefox sandbox occasionally causes timeout/crash flakiness in plain `test:e2e`.
- Use `npm run test:e2e:host` (sandbox-relaxed + retry) as the default CI/check path in this repo.

### E2E Environment (Server)

- Node: `>= 22`
- npm: `>= 11`
- Playwright package: `@playwright/test`
- Browser binary: Playwright-managed Firefox (`~/.cache/ms-playwright`), not system `firefox`.
- Recommended command in venv:
  - `source /home/aiops/zhaojx/venv/games/bin/activate`
  - `npm run check`

## Code Map

- `src/core/constants.ts`: simulation and gameplay constants
- `src/core/physics.ts`: pure math/physics helper functions
- `src/core/level.ts`: level and material config (data-driven scene definition)
- `src/core/scene.ts`: rigid body scene construction from level config
- `src/core/round.ts`: round state helpers (motion query + HUD labels/messages)
- `src/main.ts`: input wiring, game loop orchestration, canvas rendering
- `tests/unit/physics.test.ts`: unit tests for core helper logic
- `tests/unit/round.test.ts`: unit tests for round-state helpers
- `tests/integration/game-flow.test.ts`: integration tests for motion gating and level-driven scene creation
