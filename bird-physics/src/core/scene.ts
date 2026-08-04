import * as planck from "planck";
import { GRAVITY_Y, WORLD_WIDTH } from "./constants";
import {
  DEFAULT_LEVEL,
  type EntityArchetypeConfig,
  type EntitySpawnConfig,
  type LevelConfig,
  type SceneryPropConfig,
} from "./level";
import { ENTITY_ROLE, type EntityKind, type EntityRole, type EntityShape, type PhysicsEntity } from "./types";

export interface TerrainBlock {
  x: number;
  y: number;
  hx: number;
  hy: number;
  color: string;
  angle: number;
}

export interface PhysicsScene {
  world: planck.World;
  anchor: planck.Vec2;
  bird: PhysicsEntity;
  entities: Map<string, PhysicsEntity>;
  bodyToEntity: Map<planck.Body, PhysicsEntity>;
  terrainBlocks: TerrainBlock[];
  sceneryProps: SceneryPropConfig[];
  groundY: number;
}

function createEntityIdFactory(prefix: string): () => string {
  let count = 0;
  return () => {
    count += 1;
    return `${prefix}-${count}`;
  };
}

function cloneShape(shape: EntityShape): EntityShape {
  if (shape.kind === "circle") {
    return { kind: "circle", radius: shape.radius };
  }
  return { kind: "box", hx: shape.hx, hy: shape.hy };
}

function createPlanckShape(shape: EntityShape): planck.Circle | planck.Polygon {
  if (shape.kind === "circle") {
    return planck.Circle(shape.radius);
  }
  return planck.Box(shape.hx, shape.hy);
}

function shapeSizeMetric(shape: EntityShape): number {
  if (shape.kind === "circle") {
    return shape.radius;
  }
  return shape.hx + shape.hy;
}

function buildEntity(
  world: planck.World,
  spawn: EntitySpawnConfig,
  archetype: EntityArchetypeConfig,
  nextEntityId: (kind: EntityKind) => string,
): PhysicsEntity {
  const shape = cloneShape(spawn.shapeOverride ?? archetype.shape);
  const body = world.createDynamicBody({
    position: planck.Vec2(spawn.position.x, spawn.position.y),
    angle: spawn.angle ?? 0,
    linearDamping: archetype.body.linearDamping,
    angularDamping: archetype.body.angularDamping,
    bullet: archetype.body.bullet,
  });

  body.createFixture(createPlanckShape(shape), {
    density: archetype.fixture.density,
    friction: archetype.fixture.friction,
    restitution: archetype.fixture.restitution,
  });

  if (archetype.body.gravityScale !== undefined) {
    body.setGravityScale(archetype.body.gravityScale);
  }
  if (archetype.body.sleepingAllowed !== undefined) {
    body.setSleepingAllowed(archetype.body.sleepingAllowed);
  }

  const durability = archetype.durability;
  const sizeMetric = shapeSizeMetric(shape);
  const maxHealth =
    spawn.maxHealthOverride ?? durability.maxHealth + (durability.maxHealthPerSize ?? 0) * sizeMetric;
  const breakImpulse =
    spawn.breakImpulseOverride ?? durability.breakImpulse + (durability.breakImpulsePerSize ?? 0) * sizeMetric;

  return {
    id: spawn.id ?? nextEntityId(archetype.kind),
    kind: archetype.kind,
    roles: [...archetype.roles],
    shape,
    body,
    maxHealth,
    health: maxHealth,
    breakImpulse,
    scoreValue: spawn.scoreValueOverride ?? archetype.scoreValue,
    color: spawn.colorOverride ?? archetype.color,
  };
}

export function createPhysicsScene(level: LevelConfig = DEFAULT_LEVEL): PhysicsScene {
  const world = new planck.World(planck.Vec2(0, GRAVITY_Y));
  const entities = new Map<string, PhysicsEntity>();
  const bodyToEntity = new Map<planck.Body, PhysicsEntity>();
  const terrainBlocks: TerrainBlock[] = [];

  const idFactories = new Map<EntityKind, () => string>();
  const nextEntityId = (kind: EntityKind): string => {
    let factory = idFactories.get(kind);
    if (!factory) {
      factory = createEntityIdFactory(kind);
      idFactories.set(kind, factory);
    }
    return factory();
  };

  const ground = world.createBody();
  ground.createFixture(planck.Edge(planck.Vec2(0, level.ground.y), planck.Vec2(WORLD_WIDTH, level.ground.y)), {
    friction: level.ground.friction,
    restitution: level.ground.restitution,
  });

  function createTerrainBlock(
    x: number,
    y: number,
    hx: number,
    hy: number,
    color: string,
    angle = 0,
    solid = true,
  ): void {
    if (solid) {
      const body = world.createBody({ position: planck.Vec2(x, y), angle });
      body.createFixture(planck.Box(hx, hy), {
        friction: 1,
        restitution: 0,
      });
    }
    terrainBlocks.push({ x, y, hx, hy, color, angle });
  }

  for (const block of level.terrainBlocks) {
    createTerrainBlock(
      block.x,
      block.y,
      block.hx,
      block.hy,
      block.color,
      block.angle ?? 0,
      block.solid ?? true,
    );
  }

  let bird: PhysicsEntity | null = null;
  for (const spawn of level.spawns) {
    const archetype = level.entityTypes[spawn.typeId];
    if (!archetype) {
      throw new Error(`Unknown entity typeId: ${spawn.typeId}`);
    }

    const entity = buildEntity(world, spawn, archetype, nextEntityId);
    if (entities.has(entity.id)) {
      throw new Error(`Duplicate entity id in level config: ${entity.id}`);
    }

    entities.set(entity.id, entity);
    bodyToEntity.set(entity.body, entity);

    if (entity.id === level.playerEntityId) {
      bird = entity;
    }
  }

  if (!bird) {
    throw new Error(`Player entity not found for id: ${level.playerEntityId}`);
  }

  return {
    world,
    anchor: planck.Vec2(level.anchor.x, level.anchor.y),
    bird,
    entities,
    bodyToEntity,
    terrainBlocks,
    sceneryProps: level.sceneryProps.map((item) => ({ ...item })),
    groundY: level.ground.y,
  };
}

export function hasRole(entity: PhysicsEntity, role: EntityRole): boolean {
  return entity.roles.includes(role);
}

export function countAliveTargets(scene: PhysicsScene): number {
  let count = 0;
  for (const entity of scene.entities.values()) {
    if (hasRole(entity, ENTITY_ROLE.TARGET)) {
      count += 1;
    }
  }
  return count;
}

// Backward-compatible alias used by existing callers.
export const countAlivePigs = countAliveTargets;
