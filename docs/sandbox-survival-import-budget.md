# Sandbox Survival Import Budget (Part 2)

## Asset Budget Targets
- Triangles (total imported assets per map): <= `120,000`
- Materials (unique imported materials per map): <= `18`
- Texture max edge (largest imported texture): <= `2048`

These limits are enforced at runtime by `sandbox-survival/src/world/import/asset-loader.ts` via `DEFAULT_IMPORT_BUDGET`.

## Runtime Downgrade Rules
When imported assets exceed any threshold, loader applies a deterministic downgrade pass:
1. Replace imported mesh materials with a shared flat-shaded `MeshStandardMaterial`.
2. Disable high-cost mesh flags (`castShadow`, `receiveShadow`) on imported meshes.
3. Keep gameplay-critical systems active (movement, survival, save/load, transit nodes).

The downgrade decision and reasons are surfaced in import status and warning logs.

## Performance Gate (relative to Part 0)
- Average FPS must be >= `85%` of Part 0 baseline.
- Average startup time must be <= `120%` of Part 0 baseline.

Guard script:
- `npm run baseline:guard`
- Script file: `sandbox-survival/scripts/check-baseline-regression.mjs`
- Default comparison:
  - baseline: `docs/sandbox-survival-baseline-part0.json`
  - candidate: `docs/sandbox-survival-baseline.json`
