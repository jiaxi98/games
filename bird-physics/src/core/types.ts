import type { Body } from 'planck';

export type GamePhase = 'idle' | 'aiming' | 'launched' | 'resolved';

export type GameResult = 'pending' | 'victory' | 'defeat';

export type EntityKind = 'bird' | 'pig' | 'wood';

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
