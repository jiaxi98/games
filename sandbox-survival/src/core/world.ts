import { createSeededRandom } from './seed';

export interface ChunkCoord {
  x: number;
  z: number;
}

export interface WorldBootstrap {
  seed: number;
  spawnChunk: ChunkCoord;
  chunkQueue: ChunkCoord[];
}

export function generateInitialChunkRing(radius: number): ChunkCoord[] {
  if (!Number.isInteger(radius) || radius < 0) {
    throw new Error('radius must be a non-negative integer.');
  }

  const chunks: ChunkCoord[] = [];
  for (let z = -radius; z <= radius; z += 1) {
    for (let x = -radius; x <= radius; x += 1) {
      chunks.push({ x, z });
    }
  }
  return chunks;
}

export function bootstrapWorld(seed: number, renderRadius: number): WorldBootstrap {
  const rng = createSeededRandom(seed);
  const jitterX = rng.nextInt(3) - 1;
  const jitterZ = rng.nextInt(3) - 1;

  return {
    seed,
    spawnChunk: { x: jitterX, z: jitterZ },
    chunkQueue: generateInitialChunkRing(renderRadius),
  };
}
