import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { SpatialHash } from '../../src/simulation/SpatialHash.js';

describe('SpatialHash', () => {
  it('returns only items inside the requested radius', () => {
    const hash = new SpatialHash(5);
    const near = { position: new Vector3(1, 0, 1) };
    const far = { position: new Vector3(20, 0, 20) };
    hash.rebuild([near, far]);
    expect(hash.query(new Vector3(), 3)).toEqual([near]);
  });
});

