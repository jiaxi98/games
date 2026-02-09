import type { Vec3 } from '../contracts/game-state';
import { RESOURCE_KINDS, type ResourceKind } from '../contracts/kinds';
import { createSeededRandom } from '../core/seed';
import type { ChunkCoord } from '../core/world';
import { sampleTerrainHeight } from './terrain';

export const CHUNK_SIZE = 12;
const RESOURCES_PER_CHUNK = 3;

export interface ResourceNode {
  id: string;
  kind: ResourceKind;
  position: Vec3;
  yieldAmount: number;
  wearCost: number;
}

export interface PlacedStructure {
  id: string;
  kind: ResourceKind;
  position: Vec3;
}

interface ResourceProfile {
  nodeColor: number;
  structureColor: number;
  yieldAmount: number;
  wearCost: number;
}

const RESOURCE_PROFILES: Record<ResourceKind, ResourceProfile> = {
  wood: {
    nodeColor: 0xf59e0b,
    structureColor: 0x92400e,
    yieldAmount: 2,
    wearCost: 1.35,
  },
  stone: {
    nodeColor: 0x9ca3af,
    structureColor: 0x6b7280,
    yieldAmount: 1,
    wearCost: 3.05,
  },
};

export function getResourceProfile(kind: ResourceKind): ResourceProfile {
  return RESOURCE_PROFILES[kind];
}

export function generateResourceNodes(seed: number, chunks: ChunkCoord[], spawnChunk: ChunkCoord): ResourceNode[] {
  const rng = createSeededRandom(seed ^ 0xa11ce5);
  const nodes: ResourceNode[] = [];

  for (const chunk of chunks) {
    const centerX = chunk.x * CHUNK_SIZE;
    const centerZ = chunk.z * CHUNK_SIZE;

    for (let index = 0; index < RESOURCES_PER_CHUNK; index += 1) {
      const offsetX = (rng.next() - 0.5) * (CHUNK_SIZE - 3);
      const offsetZ = (rng.next() - 0.5) * (CHUNK_SIZE - 3);
      const kind = RESOURCE_KINDS[rng.next() < 0.58 ? 0 : 1];
      const profile = getResourceProfile(kind);

      nodes.push({
        id: `${chunk.x}:${chunk.z}:${index}`,
        kind,
        position: {
          x: centerX + offsetX,
          y: sampleTerrainHeight(centerX + offsetX, centerZ + offsetZ, seed) + 0.55,
          z: centerZ + offsetZ,
        },
        yieldAmount: profile.yieldAmount,
        wearCost: profile.wearCost,
      });
    }
  }

  const spawnX = spawnChunk.x * CHUNK_SIZE;
  const spawnZ = spawnChunk.z * CHUNK_SIZE;

  const starterNodes: ResourceNode[] = [
    {
      id: 'starter:wood',
      kind: 'wood',
      position: {
        x: spawnX + 0.15,
        y: sampleTerrainHeight(spawnX + 0.15, spawnZ - 3.4, seed) + 0.75,
        z: spawnZ - 3.4,
      },
      yieldAmount: 2,
      wearCost: 1.2,
    },
    {
      id: 'starter:stone',
      kind: 'stone',
      position: {
        x: spawnX - 1.8,
        y: sampleTerrainHeight(spawnX - 1.8, spawnZ - 5.1, seed) + 0.7,
        z: spawnZ - 5.1,
      },
      yieldAmount: 1,
      wearCost: 2.6,
    },
  ];

  return [...starterNodes, ...nodes];
}

export function createStructureId(kind: ResourceKind, index: number): string {
  return `structure:${kind}:${index}`;
}
