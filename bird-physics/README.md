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
- `npm run test:coverage`
- `npm run build`
- `npm run check`

## Code Map

- `src/core/constants.ts`: simulation and gameplay constants
- `src/core/physics.ts`: pure math/physics helper functions
- `src/core/scene.ts`: rigid body scene construction
- `src/main.ts`: input, game loop, collision damage, rendering
- `tests/unit/physics.test.ts`: unit tests for core helper logic
