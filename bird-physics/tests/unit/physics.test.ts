import { describe, expect, it } from 'vitest';
import { calculateLaunchVelocity, clampDragPosition, computeImpactDamage } from '../../src/core/physics';

describe('physics helpers', () => {
  it('clamps drag point to the configured maximum distance', () => {
    const anchor = { x: 0, y: 0 };
    const pointer = { x: 3, y: 4 };
    const clamped = clampDragPosition(anchor, pointer, 2.5);

    expect(clamped.x).toBeCloseTo(1.5, 6);
    expect(clamped.y).toBeCloseTo(2, 6);
  });

  it('returns unchanged point when drag is already inside range', () => {
    const anchor = { x: 10, y: 10 };
    const pointer = { x: 11, y: 10.5 };
    const clamped = clampDragPosition(anchor, pointer, 3);

    expect(clamped).toEqual(pointer);
  });

  it('computes launch velocity from anchor to dragged position', () => {
    const velocity = calculateLaunchVelocity({ x: 4, y: 4 }, { x: 2, y: 5 }, 5, 99);
    expect(velocity).toEqual({ x: 10, y: -5 });
  });

  it('limits launch speed to configured maximum', () => {
    const velocity = calculateLaunchVelocity({ x: 0, y: 0 }, { x: -8, y: 0 }, 5, 20);
    const speed = Math.hypot(velocity.x, velocity.y);

    expect(speed).toBeCloseTo(20, 6);
    expect(velocity.y).toBe(0);
  });

  it('returns zero damage under break impulse threshold', () => {
    expect(computeImpactDamage(2.9, 3.2)).toBe(0);
  });

  it('returns scaled overflow damage beyond threshold', () => {
    const damage = computeImpactDamage(9, 3, 1.1);
    expect(damage).toBeCloseTo(6.6, 6);
  });
});
