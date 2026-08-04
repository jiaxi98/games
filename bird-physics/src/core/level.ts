import { GROUND_Y, SLING_ANCHOR } from "./constants";
import {
  ENTITY_KIND,
  ENTITY_ROLE,
  type EntityKind,
  type EntityRole,
  type EntityShape,
  type Vec2Like,
} from "./types";

export interface GroundConfig {
  y: number;
  friction: number;
  restitution: number;
}

export interface TerrainBlockConfig {
  x: number;
  y: number;
  hx: number;
  hy: number;
  color: string;
  angle?: number;
  solid?: boolean;
}

export type SceneryLayer = "far" | "mid" | "front";

export type SceneryKind = "mountain" | "hill" | "tree" | "bush" | "rock" | "cloud";

export interface SceneryPropConfig {
  kind: SceneryKind;
  layer: SceneryLayer;
  x: number;
  y: number;
  scale: number;
  color?: string;
  width?: number;
  height?: number;
  opacity?: number;
}

export interface BodyConfig {
  linearDamping: number;
  angularDamping: number;
  bullet?: boolean;
  gravityScale?: number;
  sleepingAllowed?: boolean;
}

export interface FixtureConfig {
  density: number;
  friction: number;
  restitution: number;
}

export interface DurabilityConfig {
  maxHealth: number;
  breakImpulse: number;
  maxHealthPerSize?: number;
  breakImpulsePerSize?: number;
}

export interface EntityArchetypeConfig {
  kind: EntityKind;
  roles: EntityRole[];
  shape: EntityShape;
  body: BodyConfig;
  fixture: FixtureConfig;
  durability: DurabilityConfig;
  scoreValue: number;
  color: string;
}

export interface EntitySpawnConfig {
  id?: string;
  typeId: string;
  position: Vec2Like;
  angle?: number;
  shapeOverride?: EntityShape;
  maxHealthOverride?: number;
  breakImpulseOverride?: number;
  scoreValueOverride?: number;
  colorOverride?: string;
}

export interface LevelConfig {
  anchor: Vec2Like;
  ground: GroundConfig;
  terrainBlocks: TerrainBlockConfig[];
  sceneryProps: SceneryPropConfig[];
  entityTypes: Record<string, EntityArchetypeConfig>;
  spawns: EntitySpawnConfig[];
  playerEntityId: string;
}

export const DEFAULT_LEVEL: LevelConfig = {
  anchor: { ...SLING_ANCHOR },
  ground: {
    y: GROUND_Y,
    friction: 0.72,
    restitution: 0.06,
  },
  terrainBlocks: [
    { x: 4.1, y: 15.55, hx: 1.7, hy: 0.85, color: "#88a76b", solid: false },
    { x: 6.6, y: 16.08, hx: 1.18, hy: 0.24, color: "#7a8e58", angle: -0.14, solid: true },
    { x: 13.1, y: 15.84, hx: 0.95, hy: 0.15, color: "#8aa56a", angle: -0.06, solid: false },
    { x: 15.5, y: 15.75, hx: 1.55, hy: 0.21, color: "#728651", angle: -0.24, solid: true },
    { x: 19.2, y: 16.04, hx: 3.25, hy: 0.34, color: "#6f8350", solid: true },
    { x: 22.75, y: 15.82, hx: 1.4, hy: 0.22, color: "#748a53", angle: 0.18, solid: true },
    { x: 25.25, y: 15.52, hx: 0.9, hy: 0.2, color: "#6b7b4c", angle: -0.18, solid: true },
  ],
  sceneryProps: [
    { kind: "cloud", layer: "far", x: 6.2, y: 3.4, scale: 1.1, opacity: 0.44 },
    { kind: "cloud", layer: "far", x: 12.6, y: 2.8, scale: 1.35, opacity: 0.36 },
    { kind: "cloud", layer: "far", x: 21.8, y: 4.2, scale: 1.08, opacity: 0.4 },

    { kind: "mountain", layer: "far", x: 6.8, y: 12.8, width: 10.8, height: 6.4, scale: 1, color: "#8ea0aa" },
    { kind: "mountain", layer: "far", x: 15.8, y: 13.1, width: 12.6, height: 7.3, scale: 1, color: "#7f8f9c" },
    { kind: "mountain", layer: "far", x: 24.4, y: 13.0, width: 10.5, height: 6.1, scale: 1, color: "#738392" },

    { kind: "hill", layer: "mid", x: 5.6, y: 15.45, width: 6.2, height: 2.7, scale: 1, color: "#789057" },
    { kind: "hill", layer: "mid", x: 12.8, y: 15.55, width: 7.4, height: 2.9, scale: 1, color: "#6f8650" },
    { kind: "hill", layer: "mid", x: 21.1, y: 15.38, width: 7.6, height: 3.2, scale: 1, color: "#6a7e4a" },
    { kind: "hill", layer: "mid", x: 27.3, y: 15.6, width: 5.1, height: 2.5, scale: 1, color: "#718953" },

    { kind: "tree", layer: "mid", x: 2.6, y: 14.55, scale: 1.18, color: "#405d33" },
    { kind: "tree", layer: "mid", x: 9.7, y: 14.8, scale: 0.98, color: "#45663a" },
    { kind: "tree", layer: "mid", x: 16.2, y: 14.7, scale: 1.04, color: "#3e5a31" },
    { kind: "tree", layer: "mid", x: 23.9, y: 14.62, scale: 1.15, color: "#3b5630" },
    { kind: "tree", layer: "mid", x: 28.2, y: 14.75, scale: 0.9, color: "#46673b" },

    { kind: "bush", layer: "front", x: 1.3, y: 15.75, scale: 1.08, color: "#4f743e" },
    { kind: "bush", layer: "front", x: 7.7, y: 15.88, scale: 1.16, color: "#4a6b3c" },
    { kind: "bush", layer: "front", x: 14.5, y: 15.86, scale: 1.02, color: "#486739" },
    { kind: "bush", layer: "front", x: 24.2, y: 15.78, scale: 1.24, color: "#4a6a3b" },
    { kind: "rock", layer: "front", x: 11.4, y: 15.95, scale: 1.02, color: "#7f846f" },
    { kind: "rock", layer: "front", x: 20.8, y: 15.98, scale: 1.14, color: "#777d68" },
  ],
  entityTypes: {
    bird_basic: {
      kind: ENTITY_KIND.BIRD,
      roles: [ENTITY_ROLE.PROJECTILE],
      shape: { kind: "circle", radius: 0.36 },
      body: {
        linearDamping: 0.2,
        angularDamping: 0.8,
        bullet: true,
        gravityScale: 0,
        sleepingAllowed: false,
      },
      fixture: {
        density: 3.6,
        friction: 0.38,
        restitution: 0.16,
      },
      durability: {
        maxHealth: 999,
        breakImpulse: Number.POSITIVE_INFINITY,
      },
      scoreValue: 0,
      color: "#d9432f",
    },
    wood_basic: {
      kind: ENTITY_KIND.WOOD,
      roles: [ENTITY_ROLE.STRUCTURE],
      shape: { kind: "box", hx: 0.3, hy: 0.3 },
      body: {
        linearDamping: 0.35,
        angularDamping: 1.7,
      },
      fixture: {
        density: 0.84,
        friction: 0.9,
        restitution: 0.03,
      },
      durability: {
        maxHealth: 12,
        breakImpulse: 2.15,
        maxHealthPerSize: 6.2,
        breakImpulsePerSize: 0.52,
      },
      scoreValue: 120,
      color: "#9c6a3b",
    },
    pig_basic: {
      kind: ENTITY_KIND.PIG,
      roles: [ENTITY_ROLE.TARGET],
      shape: { kind: "circle", radius: 0.38 },
      body: {
        linearDamping: 0.32,
        angularDamping: 1.5,
      },
      fixture: {
        density: 1.2,
        friction: 0.55,
        restitution: 0.08,
      },
      durability: {
        maxHealth: 5,
        breakImpulse: 0.9,
      },
      scoreValue: 500,
      color: "#7ecb65",
    },
  },
  spawns: [
    {
      id: "bird-main",
      typeId: "bird_basic",
      position: { ...SLING_ANCHOR },
    },
    { typeId: "wood_basic", position: { x: 18.2, y: 14.5 }, shapeOverride: { kind: "box", hx: 0.24, hy: 1.2 } },
    { typeId: "wood_basic", position: { x: 19.2, y: 14.5 }, shapeOverride: { kind: "box", hx: 0.24, hy: 1.2 } },
    { typeId: "wood_basic", position: { x: 20.2, y: 14.5 }, shapeOverride: { kind: "box", hx: 0.24, hy: 1.2 } },
    { typeId: "wood_basic", position: { x: 19.2, y: 13.1 }, shapeOverride: { kind: "box", hx: 2.05, hy: 0.2 } },
    { typeId: "wood_basic", position: { x: 18.45, y: 11.95 }, shapeOverride: { kind: "box", hx: 0.22, hy: 0.9 } },
    { typeId: "wood_basic", position: { x: 19.95, y: 11.95 }, shapeOverride: { kind: "box", hx: 0.22, hy: 0.9 } },
    { typeId: "wood_basic", position: { x: 19.2, y: 10.82 }, shapeOverride: { kind: "box", hx: 1.45, hy: 0.19 } },
    { typeId: "pig_basic", position: { x: 19.2, y: 12.5 } },
    { typeId: "pig_basic", position: { x: 19.2, y: 10.25 } },
  ],
  playerEntityId: "bird-main",
};
