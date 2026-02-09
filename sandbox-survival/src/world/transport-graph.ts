import type { Vec3 } from '../contracts/game-state';

export type TravelLayer = 'surface' | 'underground';
export type TravelKind = 'elevator' | 'tunnel' | 'metro' | 'cave';

export interface TravelNode {
  id: string;
  label: string;
  kind: TravelKind;
  layer: TravelLayer;
  targetId: string;
  position: Vec3;
}

export interface TravelRegistry {
  nodes: TravelNode[];
  byId: Map<string, TravelNode>;
}

export function createTravelRegistry(): TravelRegistry {
  return {
    nodes: [],
    byId: new Map<string, TravelNode>(),
  };
}

export function clearTravelRegistry(registry: TravelRegistry): void {
  registry.nodes.splice(0, registry.nodes.length);
  registry.byId.clear();
}

export function registerTravelNode(registry: TravelRegistry, node: TravelNode): void {
  registry.nodes.push(node);
  registry.byId.set(node.id, node);
}

export function getTravelTarget(registry: TravelRegistry, source: TravelNode): TravelNode | null {
  return registry.byId.get(source.targetId) ?? null;
}

export function findNearestTravelNode(
  registry: TravelRegistry,
  playerPosition: Vec3,
  playerLayer: TravelLayer,
  range = 2.6,
): TravelNode | null {
  let nearest: TravelNode | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const node of registry.nodes) {
    const verticalPenalty = node.layer !== playerLayer ? 1.8 : 0;
    const distance = Math.hypot(node.position.x - playerPosition.x, node.position.z - playerPosition.z) + verticalPenalty;
    if (distance > range || distance >= nearestDistance) {
      continue;
    }
    nearest = node;
    nearestDistance = distance;
  }

  return nearest;
}

export function getTravelKindColor(kind: TravelKind): number {
  switch (kind) {
    case 'elevator':
      return 0xe9d08b;
    case 'metro':
      return 0x88a4d8;
    case 'cave':
      return 0x9b8e80;
    case 'tunnel':
    default:
      return 0x8bc7b1;
  }
}
