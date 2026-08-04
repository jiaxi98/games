# Game Development Experience Notes (Beginner-focused)

## Why Game Development Feels Different from App Development

A game is not just UI + data. It is a loop:

1. Read input
2. Update world state
3. Render frame
4. Repeat

If any part is unstable, the player immediately feels it.

## Practical Lifecycle for Small Games

### Phase 1: Rule Clarification

Define exact rules first:

- What is a valid move?
- What causes win/lose?
- What updates each tick?
- What can happen simultaneously?

If rules are vague, implementation and tests drift apart.

### Phase 2: Playable Core First

Build the minimum closed loop:

- Start
- Move
- Interact
- Fail
- Restart

Polish before this loop is complete usually slows progress.

### Phase 3: State and UX

Add explicit states:

- `idle`
- `running`
- `paused`
- `game_over`

State-driven UI removes ambiguous behavior and hidden bugs.

### Phase 4: Quality Gates

Use layered checks:

1. Pure logic unit tests (highest ROI)
2. Smoke UI automation (launch + key interactions)
3. Manual feel test (speed, readability, comfort)

Games require manual feel checks because not every UX issue is assertion-friendly.

## Engineering Patterns that Worked in This Snake Project

### 1. Pure core logic module

Keep movement/collision/spawn logic separate from DOM/Canvas.

Benefits:

- Faster test runs
- Easier debugging
- Safer refactors

### 2. Fixed timestep, not frame-coupled speed

Update by interval (tick), not by render frame.

Benefits:

- Stable gameplay across devices
- Predictable difficulty tuning

### 3. Explicit input guardrails

Prevent immediate reverse turns in snake-style movement.

Benefits:

- Avoid accidental self-collision from input spikes
- Improves control trust

## Common Beginner Pitfalls to Avoid

1. Mixing rendering logic and game rules in one function
2. Depending on `requestAnimationFrame` alone for game speed
3. No state machine, only scattered booleans
4. Adding effects/animations before gameplay is correct
5. Treating “it looks fine once” as enough testing

## How to Learn Efficiently from This Project

Use this sequence when reading the code:

1. `snake/src/core/types.ts`
2. `snake/src/core/game.ts`
3. `snake/src/main.ts`
4. `snake/tests/unit/game.test.ts`

Reason:

- Understand data model first
- Then understand rules
- Then understand rendering/input orchestration
- Finally see executable examples in tests

## What to Practice Next (for your second game)

1. Add one new mechanic to Snake (obstacles or timed bonus food)
2. Preserve architecture split (core vs UI)
3. Extend tests before implementing mechanic
4. Keep a short dev log per milestone

This rhythm scales from toy games to larger projects.
