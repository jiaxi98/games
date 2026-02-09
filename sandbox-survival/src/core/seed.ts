export interface SeededRandom {
  next(): number;
  nextInt(maxExclusive: number): number;
}

const UINT32_MAX = 0x1_0000_0000;

export function createSeededRandom(initialSeed: number): SeededRandom {
  let state = initialSeed >>> 0;

  return {
    next(): number {
      state = (1664525 * state + 1013904223) >>> 0;
      return state / UINT32_MAX;
    },
    nextInt(maxExclusive: number): number {
      if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
        throw new Error('maxExclusive must be a positive integer.');
      }
      return Math.floor(this.next() * maxExclusive);
    },
  };
}
