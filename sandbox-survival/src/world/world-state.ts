import { bootstrapWorld, type ChunkCoord } from '../core/world';
import { CHUNK_SIZE, generateResourceNodes, type ResourceNode } from './resources';

export interface WorldBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface WorldState {
  seed: number;
  renderRadius: number;
  spawnChunk: ChunkCoord;
  chunkQueue: ChunkCoord[];
  resourceNodes: ResourceNode[];
}

export function createWorldState(seed: number, renderRadius: number): WorldState {
  const world = bootstrapWorld(seed, renderRadius);

  return {
    seed,
    renderRadius,
    spawnChunk: world.spawnChunk,
    chunkQueue: world.chunkQueue,
    resourceNodes: generateResourceNodes(seed, world.chunkQueue, world.spawnChunk),
  };
}

export function computeWorldBounds(chunks: ChunkCoord[]): WorldBounds {
  const xValues = chunks.map((chunk) => chunk.x);
  const zValues = chunks.map((chunk) => chunk.z);

  const minChunkX = Math.min(...xValues);
  const maxChunkX = Math.max(...xValues);
  const minChunkZ = Math.min(...zValues);
  const maxChunkZ = Math.max(...zValues);

  const halfChunk = CHUNK_SIZE / 2;

  return {
    minX: minChunkX * CHUNK_SIZE - halfChunk,
    maxX: maxChunkX * CHUNK_SIZE + halfChunk,
    minZ: minChunkZ * CHUNK_SIZE - halfChunk,
    maxZ: maxChunkZ * CHUNK_SIZE + halfChunk,
  };
}
