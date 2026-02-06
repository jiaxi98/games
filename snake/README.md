# Snake

A browser-based Snake game built with TypeScript and Canvas.

## Run

```bash
npm install
npm run dev
```

If you are on this remote server environment, keep default `.npmrc` settings as-is to avoid npm cache permission and socket issues.

## Controls

- `Arrow keys` or `W/A/S/D`: steer snake
- `Enter`: start game / restart after game over
- `Space`: pause / resume
- `R`: reset round to idle state

## Scripts

- `npm run dev`: start local development server
- `npm run build`: TypeScript check and production build
- `npm run preview`: preview production build
- `npm run typecheck`: run TypeScript type check
- `npm run test:unit`: run unit tests (Vitest)
- `npm run test:coverage`: run unit tests with coverage
- `npm run test:e2e`: run Playwright smoke tests
- `npm run check`: run typecheck + unit tests

## Test Strategy

- Unit tests cover game rules in `src/core/game.ts`
- E2E smoke tests cover basic UI interactions and game state transitions
- Manual playtest is still required for speed tuning and UX feel

## Remote Server Note

On this current server image, Playwright browser startup fails without `libgbm.so.1`.
If you want e2e to run here, the host needs that system library installed first.
