# Sandbox Survival Baseline Report

- Generated At: 2026-02-09T07:33:30.256Z
- Commit: `62c41be`
- Environment: firefox headless @ http://127.0.0.1:4173

## Scope

- Baseline freeze for current playable build before Part 1 architecture split.
- Metrics include startup time, FPS, draw calls, map switching, F-transport, and save/load.

## Metrics

| Map | Startup (ms) | Avg FPS | Min FPS | Max FPS | Renderer | Draw Calls | Triangles | Map Switch | F Transport | Save/Load |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | --- | --- | --- |
| wildlands | 973 | 60.01 | 58.28 | 62.19 | ready (fallback) | n/a | n/a | PASS | PASS | PASS |
| tiananmen | 668 | 60.00 | 57.94 | 62.19 | ready (fallback) | n/a | n/a | PASS | PASS | PASS |
| yiheyuan | 686 | 60.01 | 58.07 | 62.19 | ready (fallback) | n/a | n/a | PASS | PASS | PASS |

## Notes

- `drawCalls` and `triangles` are `n/a` when running in fallback renderer mode (no WebGL context).
- F-transport check uses a nearby surface transport node and verifies teleport message/position change.
- Save/Load check writes map-scoped slot then reloads and validates position restoration.

## Map Details

- wildlands: Wildlands Frontier: River canyon wilderness with a compact industrial city.; transport message: "elevator: Elevator Upper Lobby -> Metro Elevator Concourse"; save="saved", load="loaded save"
- tiananmen: Tiananmen Inspired Plaza: Monumental central axis, ceremonial square, and fortified gate silhouette.; transport message: "elevator: Elevator Upper Lobby -> Metro Elevator Concourse"; save="saved", load="loaded save"
- yiheyuan: Summer Palace Inspired Garden: Lakeside promenade, pavilion cluster, and hillside garden district.; transport message: "elevator: Elevator Upper Lobby -> Metro Elevator Concourse"; save="saved", load="loaded save"
