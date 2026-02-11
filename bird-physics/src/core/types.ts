import type { Body } from 'planck';

export type GamePhase = 'idle' | 'aiming' | 'launched' | 'resolved';

export type GameResult = 'pending' | 'victory' | 'defeat';

export const ENTITY_KIND = {
  BIRD: 'bird',
  PIG: 'pig',
  WOOD: 'wood',
} as const;
export type EntityKind = (typeof ENTITY_KIND)[keyof typeof ENTITY_KIND];

export const ENTITY_ROLE = {
  PROJECTILE: 'projectile',
  TARGET: 'target',
  STRUCTURE: 'structure',
} as const;
export type EntityRole = (typeof ENTITY_ROLE)[keyof typeof ENTITY_ROLE];

export type EntityShape =
  | {
      kind: 'circle';
      radius: number;
    }
  | {
      kind: 'box';
      hx: number;
      hy: number;
    };

export interface PhysicsEntity {
  id: string;
  kind: EntityKind;
  roles: EntityRole[];
  shape: EntityShape;
  body: Body;
  maxHealth: number;
  health: number;
  breakImpulse: number;
  scoreValue: number;
  color: string;
}

export interface Vec2Like {
  x: number;
  y: number;
}
