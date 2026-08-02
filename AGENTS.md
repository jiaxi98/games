# Iron Vow — Agent Instructions

## Mission

Build an original, historically grounded first-person action role-playing game set in medieval Europe with large-scale battles. The implementation must use Three.js and run locally in a desktop browser.

The benchmark is the battlefield spectacle, audiovisual impact, responsiveness, and overall polish associated with modern AAA action games. This is a quality direction, not permission to copy protected characters, stories, maps, UI, audio, or assets.

## Product constraints

- The result must be a real interactive game, not a video, fixed-camera trick, full-screen render, or non-playable mockup.
- Use original names, factions, story, visual designs, mechanics, code, and generated assets.
- Keep the setting materially grounded in medieval Europe. Avoid overt magic, monsters, glowing fantasy weapons, or modern elements.
- The camera and primary controls are first-person.
- A complete run must have a beginning, objectives, escalating combat, a climax, victory/failure states, and replay.
- Large battlefield scale may use simulation LOD, instancing, impostors, or other honest real-time techniques.
- Prefer procedural and code-native content so the repository remains reproducible.
- Never claim literal commercial AAA equivalence. Pursue AAA-style presentation within a browser vertical slice.

## Engineering expectations

- Keep systems modular and disposable; avoid a monolithic `main.js`.
- Use deterministic or bounded-random simulation where tests benefit.
- Keep frame allocations low in update loops.
- Use instancing, pooling, spatial partitioning, and AI LOD for crowds.
- Degrade gracefully if optional post-processing or audio is unavailable.
- Do not suppress runtime errors. Fix them.
- Preserve edits made by concurrent agents and integrate rather than revert.

## Definition of done

Before declaring the vertical slice complete:

1. `npm run build` succeeds.
2. Automated tests and static checks succeed.
3. The game loads from a clean local install without console errors.
4. A reviewer can finish the intended mission using keyboard and mouse.
5. Pause, death, victory, restart, pointer lock, and resize flows work.
6. The player can move, fight, take damage, and affect the battle outcome.
7. Soldiers exhibit factions, targeting, combat, death, and at least coarse morale or formation behavior.
8. The environment communicates a coherent medieval battle with strong near-, mid-, and far-field composition.
9. Performance is measured and obvious hotspots are addressed.
10. A separate visual/gameplay reviewer inspects actual screenshots and play behavior, reports concrete shortcomings, and high-impact findings are fixed and rechecked.

## Verification loop

For each milestone:

1. Implement.
2. Build and run tests.
3. Launch the real game.
4. Exercise representative gameplay, including failure paths.
5. Capture screenshots at gameplay viewpoints.
6. Review visuals, animation/feedback, usability, correctness, and performance.
7. Fix the highest-impact shortcomings.
8. Repeat until the acceptance criteria are met or a concrete blocker is documented.

