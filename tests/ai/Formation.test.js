import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { Formation, FormationType } from '../../src/ai/Formation.js';
import { CohesionState } from '../../src/ai/SquadMorale.js';

describe('Formation', () => {
  it('keeps an ordered spear wall tight and visibly loosens when fractured', () => {
    const formation = new Formation({
      type: FormationType.SPEAR_WALL,
      frontage: 6,
      spacing: 1.2,
    });
    const ordered = formation.slot(5, 12, CohesionState.ORDERED, new Vector3()).clone();
    const fractured = formation.slot(5, 12, CohesionState.FRACTURED, new Vector3()).clone();
    expect(Math.abs(fractured.x)).toBeGreaterThan(Math.abs(ordered.x));
  });
});

