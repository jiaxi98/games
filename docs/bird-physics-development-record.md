# Bird Physics Development Record

## Project Metadata

- Repository: `games`
- Branch: `feature/bird-physics`
- Development date: February 7, 2026
- Target style: autonomous execution with milestone log

## Objective

Build a harder second game prototype where complexity increases specifically along the physics dimension.

## Fixed Scope

1. Single level
2. Single bird type
3. Rigid body simulation with:
   - gravity
   - damping (air drag approximation)
   - friction and restitution
   - angular motion
   - impulse-based damage/destruction

## Milestone Plan vs Result

| Milestone | Goal | Result |
|---|---|---|
| M0 | Scope freeze (physics-first) | Completed |
| M1 | New branch + project scaffold | Completed |
| M2 | Rigid world + slingshot launch loop | Completed |
| M3 | Damage/destruction + win/lose cycle | Completed |
| M4 | Tests + build verification | Completed |
| M5 | Documentation + PR output | Completed |

## Architecture Decisions

## A. Use existing rigid body engine (`planck`)

Reason:

- Focus on gameplay/physics tuning, not low-level solver implementation.
- Keeps 1-hour execution target realistic.

## B. Separate pure helper math from scene/runtime code

- Pure functions in `src/core/physics.ts`
- World and entities in `src/core/scene.ts`
- Runtime state + render/input in `src/main.ts`

Reason:

- Physics tuning can be unit-tested quickly.
- Rendering and rules remain decoupled.

## C. Impulse-threshold damage model

- Read collision impulse from `post-solve`
- Convert overflow impulse to entity damage
- Destroy entities after health depletion

Reason:

- Closer to expected "structure collapse" behavior than binary collision rules.

## Implemented Features

1. Drag-and-release slingshot input
2. Single bird launch with capped initial speed
3. World with wood structures and pig targets
4. Physics body parameters (density/friction/restitution/damping)
5. Collision impulse damage for wood and pigs
6. Score system and target tracking
7. State machine:
   - `idle`
   - `aiming`
   - `launched`
   - `resolved`
8. Victory and defeat conditions

## Validation Log

Passed:

1. `npm run typecheck`
2. `npm run test:unit` (6 tests)
3. `npm run test:coverage` (100% for helper module)
4. `npm run build`
5. `npm run check`
6. Dev server smoke check via `curl` on local port

## Deferred User Validation (Paused)

Subjective checks intentionally deferred until user is online:

1. Launch feel and slingshot sensitivity
2. Damage threshold tuning realism
3. Visual readability of impact feedback
4. Overall difficulty balance (too easy vs too punishing)

## Risks and Next Tuning Axis

1. Current damage constants are stable but hand-tuned; may need retuning after playtest.
2. Single-shot round design is intentionally strict; adding additional birds changes difficulty heavily.
3. No break animation yet; destroyed body removal is instant.

## Suggested Follow-up (after user validation)

1. Add second bird with queue and camera follow
2. Add material classes (wood/stone/glass) with distinct resistance
3. Add impact VFX and audio cues
