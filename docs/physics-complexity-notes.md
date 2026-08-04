# Physics Complexity Notes for Game Development

## What Changes When You Scale Difficulty by Physics

Moving from Snake/Breakout-style gameplay to rigid-body gameplay changes the main engineering burden:

1. The world is no longer deterministic from simple rules alone.
2. Small parameter changes can create large behavior changes.
3. Debugging requires both code reasoning and simulation tuning.

## Practical Complexity Axes in Physics-heavy Games

1. Body model:
   - point-like objects -> finite-size rigid bodies
2. Interaction model:
   - boundary checks -> continuous collision and contact resolution
3. Energy model:
   - idealized motion -> damping, friction, restitution loss
4. Stability model:
   - direct updates -> solver iterations and fixed timestep constraints
5. Destruction model:
   - binary hit logic -> impulse/energy threshold based breakage

## Why Box2D-style Engine is a Good Middle Ground

Using `planck` (Box2D style) gives:

1. Stable collision solver and contact manifold handling
2. Configurable fixture material properties
3. Access to collision impulses for gameplay logic

You still design the game rules, but you avoid reinventing solver internals.

## Typical Beginner Mistakes in This Genre

1. Coupling render frame rate and physics step directly
2. Ignoring damping and friction while trying to tune "feel"
3. Making damage binary on contact instead of impulse-based
4. Applying destruction immediately inside collision callback without queueing

## Recommended Build Order for Physics-driven Prototypes

1. Fixed timestep loop
2. Basic world bodies
3. Input-to-force/velocity mapping
4. Collision response observation
5. Damage and destruction rules
6. UX/HUD and balancing

This order minimizes rework and makes bugs easier to isolate.
