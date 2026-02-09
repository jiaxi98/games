import type { ResourceKind } from './kinds';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type ResourceCounts = Record<ResourceKind, number>;

export interface PlayerSnapshot {
  position: Vec3;
  yaw: number;
  pitch: number;
}

export interface InventorySnapshot {
  selected: ResourceKind;
  items: ResourceCounts;
}

export interface SurvivalSnapshot {
  health: number;
  hunger: number;
  temperature: number;
  durability: number;
  clockMinutes: number;
}

export interface PlacedStructureSnapshot {
  id: string;
  kind: ResourceKind;
  position: Vec3;
}

export interface PersistedGameState {
  version: 1;
  seed: number;
  savedAt: number;
  player: PlayerSnapshot;
  inventory: InventorySnapshot;
  survival: SurvivalSnapshot;
  harvestedResourceIds: string[];
  placedStructures: PlacedStructureSnapshot[];
}
