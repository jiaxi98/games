import { Vector3 } from 'three';
import { CohesionState } from './SquadMorale.js';

export const FormationType = Object.freeze({
  LINE: 'line',
  SPEAR_WALL: 'spear-wall',
  COLUMN: 'column',
  SKIRMISH: 'skirmish',
});

export class Formation {
  constructor({
    type = FormationType.LINE,
    spacing = 1.18,
    depthSpacing = 1.1,
    frontage = 6,
  } = {}) {
    this.type = type;
    this.spacing = spacing;
    this.depthSpacing = depthSpacing;
    this.frontage = frontage;
  }

  slot(index, count, cohesionState, target = new Vector3()) {
    const frontage = Math.min(this.frontage, count);
    const row = Math.floor(index / frontage);
    const column = index % frontage;
    const rowCount = Math.min(frontage, count - row * frontage);
    const centered = column - (rowCount - 1) * 0.5;

    let spread = 1;
    let depth = this.depthSpacing;
    if (this.type === FormationType.COLUMN) {
      spread = 0.68;
      depth *= 1.15;
    } else if (this.type === FormationType.SKIRMISH) {
      spread = 1.65;
      depth *= 1.3;
    } else if (this.type === FormationType.SPEAR_WALL) {
      spread = 0.88;
      depth *= 0.82;
    }

    if (cohesionState === CohesionState.PRESSURED) spread *= 1.08;
    if (cohesionState === CohesionState.FRACTURED) spread *= 1.48;
    if (cohesionState === CohesionState.ROUTED) spread *= 2.3;

    target.set(
      centered * this.spacing * spread,
      0,
      row * depth,
    );
    if (cohesionState === CohesionState.FRACTURED) {
      target.x += hashSigned(index * 17 + count) * 0.55;
      target.z += hashSigned(index * 31 + count) * 0.48;
    } else if (cohesionState === CohesionState.ROUTED) {
      target.x += hashSigned(index * 41 + count) * 2.2;
      target.z += Math.abs(hashSigned(index * 13)) * 1.8;
    }
    return target;
  }

  worldSlot(index, count, cohesionState, anchor, forward, target = new Vector3()) {
    this.slot(index, count, cohesionState, target);
    const localX = target.x;
    const localZ = target.z;
    const rightX = forward.z;
    const rightZ = -forward.x;
    target.set(
      anchor.x + rightX * localX - forward.x * localZ,
      anchor.y,
      anchor.z + rightZ * localX - forward.z * localZ,
    );
    return target;
  }
}

function hashSigned(value) {
  const x = Math.sin(value * 91.735 + 17.13) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

