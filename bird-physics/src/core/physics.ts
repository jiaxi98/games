import type { Vec2Like } from './types';

function length(vector: Vec2Like): number {
  return Math.hypot(vector.x, vector.y);
}

export function clampDragPosition(anchor: Vec2Like, pointer: Vec2Like, maxDistance: number): Vec2Like {
  const dx = pointer.x - anchor.x;
  const dy = pointer.y - anchor.y;
  const distance = Math.hypot(dx, dy);

  if (distance <= maxDistance || distance === 0) {
    return { x: pointer.x, y: pointer.y };
  }

  const ratio = maxDistance / distance;
  return {
    x: anchor.x + dx * ratio,
    y: anchor.y + dy * ratio,
  };
}

export interface Bounds2D {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export function clampPointToBounds(point: Vec2Like, bounds: Bounds2D): Vec2Like {
  return {
    x: Math.max(bounds.minX, Math.min(bounds.maxX, point.x)),
    y: Math.max(bounds.minY, Math.min(bounds.maxY, point.y)),
  };
}

export function calculateLaunchVelocity(
  anchor: Vec2Like,
  draggedPosition: Vec2Like,
  power: number,
  maxSpeed: number,
): Vec2Like {
  const vector = {
    x: (anchor.x - draggedPosition.x) * power,
    y: (anchor.y - draggedPosition.y) * power,
  };
  const speed = length(vector);

  if (speed <= maxSpeed || speed === 0) {
    return vector;
  }

  const ratio = maxSpeed / speed;
  return {
    x: vector.x * ratio,
    y: vector.y * ratio,
  };
}

export function computeImpactDamage(impulse: number, breakImpulse: number, scale = 1.1): number {
  if (impulse <= breakImpulse) {
    return 0;
  }
  return (impulse - breakImpulse) * scale;
}
