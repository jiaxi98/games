import type { Vec3 } from '../contracts/game-state';
import type { ResourceKind } from '../contracts/kinds';
import type { PlacedStructure, ResourceNode } from '../world/resources';
import type { WorldBounds } from '../world/world-state';

export const GATHER_RANGE = 4;
const PLACEMENT_COLLISION_DISTANCE = 0.6;
const PLACEMENT_MIN_PLAYER_CLEARANCE = 1.15;
const STONE_SUPPORT_DISTANCE = 1.3;
const MAX_STRUCTURE_COUNT = 48;

export interface GatherDecision {
  ok: boolean;
  reason?: string;
  amount?: number;
  wearCost?: number;
  kind?: ResourceKind;
}

export function decideGather(params: {
  canUseTool: boolean;
  target: ResourceNode | null;
  distance: number;
  alreadyHarvested: boolean;
}): GatherDecision {
  if (!params.canUseTool) {
    return { ok: false, reason: 'tool durability exhausted' };
  }

  if (!params.target || !Number.isFinite(params.distance) || params.distance > GATHER_RANGE) {
    return { ok: false, reason: 'no resource in range' };
  }

  if (params.alreadyHarvested) {
    return { ok: false, reason: 'resource already harvested' };
  }

  return {
    ok: true,
    amount: params.target.yieldAmount,
    wearCost: params.target.wearCost,
    kind: params.target.kind,
  };
}

export interface PlacementDecision {
  ok: boolean;
  reason?: string;
}

export function decidePlacement(params: {
  selectedKind: ResourceKind;
  selectedCount: number;
  candidate: Vec3 | null;
  playerPosition: Vec3;
  bounds: WorldBounds;
  placedStructures: PlacedStructure[];
}): PlacementDecision {
  if (params.selectedCount <= 0) {
    return { ok: false, reason: `no ${params.selectedKind} left` };
  }

  if (!params.candidate) {
    return { ok: false, reason: 'placement out of bounds' };
  }

  if (!isWithinBounds(params.candidate, params.bounds)) {
    return { ok: false, reason: 'placement out of bounds' };
  }

  if (params.placedStructures.length >= MAX_STRUCTURE_COUNT) {
    return { ok: false, reason: 'build limit reached' };
  }

  const clearance = planarDistance(params.candidate, params.playerPosition);
  if (clearance < PLACEMENT_MIN_PLAYER_CLEARANCE) {
    return { ok: false, reason: 'too close to player' };
  }

  const occupied = params.placedStructures.some((structure) => {
    return planarDistance(structure.position, params.candidate as Vec3) < PLACEMENT_COLLISION_DISTANCE;
  });

  if (occupied) {
    return { ok: false, reason: 'placement blocked' };
  }

  if (params.selectedKind === 'stone' && params.placedStructures.length > 0) {
    const supported = params.placedStructures.some((structure) => {
      return planarDistance(structure.position, params.candidate as Vec3) <= STONE_SUPPORT_DISTANCE;
    });

    if (!supported) {
      return { ok: false, reason: 'stone requires adjacent support' };
    }
  }

  return { ok: true };
}

function isWithinBounds(position: Vec3, bounds: WorldBounds): boolean {
  return (
    position.x >= bounds.minX &&
    position.x <= bounds.maxX &&
    position.z >= bounds.minZ &&
    position.z <= bounds.maxZ
  );
}

function planarDistance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
