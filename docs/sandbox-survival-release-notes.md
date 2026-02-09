# Sandbox Survival MVP Release Notes (2026-02-07)

## Scope Delivered

- Web single-player first-person sandbox survival prototype.
- Core loop: move, gather, place, survive, save/load.
- Deterministic fixed-seed world with starter resources near spawn.
- Survival failure + recovery (`downed` state with `R` recover).
- Save robustness: schema validation, legacy migration, corrupted save fallback.

## Validation Summary

- Host checks passed:
  - `cd sandbox-survival && npm run typecheck`
  - `cd sandbox-survival && npm run test:unit`
  - `cd sandbox-survival && npm run test:integration`
  - `cd sandbox-survival && xvfb-run -a npm run test:e2e`
- Container gate passed:
  - `bash scripts/test-in-container.sh --app-dir sandbox-survival --image games-test-env:local`
- E2E coverage includes:
  - full gameplay loop (`gather -> place -> save -> load`),
  - downed recovery,
  - corrupted save recovery.

## Known Risks

- Survival parameters are tuned heuristically; no telemetry-driven balancing yet.
- No animation/audio feedback for recovery and survival state transitions.
- No cross-platform optimization target yet (current validation is fixed test environment only).

## Next Candidates

- Add lightweight telemetry counters for balancing iteration.
- Introduce explicit UX cues (audio/visual) for critical survival events.
- Design random-seed world mode with backward-compatible save strategy.
