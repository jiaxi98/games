import { describe, expect, it } from 'vitest';
import { createSeededRandom } from '../../src/core/seed';

describe('seeded random', () => {
  it('produces deterministic sequence for identical seeds', () => {
    const first = createSeededRandom(42);
    const second = createSeededRandom(42);

    const sequenceA = [first.next(), first.next(), first.next()];
    const sequenceB = [second.next(), second.next(), second.next()];

    expect(sequenceA).toEqual(sequenceB);
  });

  it('returns bounded integers', () => {
    const rng = createSeededRandom(7);
    const values = Array.from({ length: 25 }, () => rng.nextInt(4));
    expect(values.every((value) => value >= 0 && value < 4)).toBe(true);
  });
});
