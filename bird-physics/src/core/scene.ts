import * as planck from 'planck';
import { GRAVITY_Y, GROUND_Y, SLING_ANCHOR, WORLD_WIDTH } from './constants';
import type { PhysicsEntity } from './types';

export interface TerrainBlock {
  x: number;
  y: number;
  hx: number;
  hy: number;
  color: string;
}

export interface PhysicsScene {
  world: planck.World;
  anchor: planck.Vec2;
  bird: PhysicsEntity;
  entities: Map<string, PhysicsEntity>;
  bodyToEntity: Map<planck.Body, PhysicsEntity>;
  terrainBlocks: TerrainBlock[];
  groundY: number;
}

function createEntityIdFactory(prefix: string): () => string {
  let count = 0;
  return () => {
    count += 1;
    return `${prefix}-${count}`;
  };
}

export function createPhysicsScene(): PhysicsScene {
  const world = new planck.World(planck.Vec2(0, GRAVITY_Y));
  const entities = new Map<string, PhysicsEntity>();
  const bodyToEntity = new Map<planck.Body, PhysicsEntity>();
  const terrainBlocks: TerrainBlock[] = [];

  const nextWoodId = createEntityIdFactory('wood');
  const nextPigId = createEntityIdFactory('pig');

  const ground = world.createBody();
  ground.createFixture(planck.Edge(planck.Vec2(0, GROUND_Y), planck.Vec2(WORLD_WIDTH, GROUND_Y)), {
    friction: 0.95,
    restitution: 0.06,
  });

  function createTerrainBlock(x: number, y: number, hx: number, hy: number, color: string): void {
    const body = world.createBody({ position: planck.Vec2(x, y) });
    body.createFixture(planck.Box(hx, hy), {
      friction: 1.0,
      restitution: 0.0,
    });
    terrainBlocks.push({ x, y, hx, hy, color });
  }

  // Grounded static bases for the slingshot area and enemy structure.
  createTerrainBlock(4.2, 15.45, 1.45, 0.95, '#8ea866');
  createTerrainBlock(21.3, 16.05, 5.25, 0.35, '#829c5e');

  const anchor = planck.Vec2(SLING_ANCHOR.x, SLING_ANCHOR.y);
  const birdBody = world.createDynamicBody({
    position: anchor.clone(),
    linearDamping: 0.2,
    angularDamping: 0.8,
    bullet: true,
  });
  birdBody.createFixture(planck.Circle(0.36), {
    density: 3,
    friction: 0.52,
    restitution: 0.2,
  });
  birdBody.setGravityScale(0);
  birdBody.setSleepingAllowed(false);

  const bird: PhysicsEntity = {
    id: 'bird-main',
    kind: 'bird',
    shape: { kind: 'circle', radius: 0.36 },
    body: birdBody,
    maxHealth: 999,
    health: 999,
    breakImpulse: Number.POSITIVE_INFINITY,
    scoreValue: 0,
    color: '#d9432f',
  };
  entities.set(bird.id, bird);
  bodyToEntity.set(birdBody, bird);

  function registerWoodBlock(position: planck.Vec2, hx: number, hy: number, angle = 0): PhysicsEntity {
    const body = world.createDynamicBody({
      position,
      angle,
      linearDamping: 0.35,
      angularDamping: 1.7,
    });
    body.createFixture(planck.Box(hx, hy), {
      density: 0.84,
      friction: 0.9,
      restitution: 0.03,
    });

    const maxHealth = 18 + (hx + hy) * 9;
    const entity: PhysicsEntity = {
      id: nextWoodId(),
      kind: 'wood',
      shape: { kind: 'box', hx, hy },
      body,
      maxHealth,
      health: maxHealth,
      breakImpulse: 3.2 + (hx + hy) * 0.8,
      scoreValue: 120,
      color: '#9c6a3b',
    };
    entities.set(entity.id, entity);
    bodyToEntity.set(body, entity);
    return entity;
  }

  function registerPig(position: planck.Vec2): PhysicsEntity {
    const body = world.createDynamicBody({
      position,
      linearDamping: 0.32,
      angularDamping: 1.5,
    });
    body.createFixture(planck.Circle(0.38), {
      density: 1.2,
      friction: 0.55,
      restitution: 0.08,
    });

    const entity: PhysicsEntity = {
      id: nextPigId(),
      kind: 'pig',
      shape: { kind: 'circle', radius: 0.38 },
      body,
      maxHealth: 12,
      health: 12,
      breakImpulse: 2.1,
      scoreValue: 500,
      color: '#7ecb65',
    };
    entities.set(entity.id, entity);
    bodyToEntity.set(body, entity);
    return entity;
  }

  // Stable, symmetric structure layout: no initial tilt and no floating bodies.
  registerWoodBlock(planck.Vec2(20.25, 14.5), 0.24, 1.2, 0);
  registerWoodBlock(planck.Vec2(21.3, 14.5), 0.24, 1.2, 0);
  registerWoodBlock(planck.Vec2(22.35, 14.5), 0.24, 1.2, 0);
  registerWoodBlock(planck.Vec2(21.3, 13.1), 2.2, 0.21, 0);

  registerWoodBlock(planck.Vec2(20.55, 11.95), 0.22, 0.95, 0);
  registerWoodBlock(planck.Vec2(22.05, 11.95), 0.22, 0.95, 0);
  registerWoodBlock(planck.Vec2(21.3, 10.8), 1.55, 0.2, 0);

  registerPig(planck.Vec2(21.3, 12.5));
  registerPig(planck.Vec2(21.3, 10.2));

  return {
    world,
    anchor,
    bird,
    entities,
    bodyToEntity,
    terrainBlocks,
    groundY: GROUND_Y,
  };
}

export function countAlivePigs(scene: PhysicsScene): number {
  let count = 0;
  for (const entity of scene.entities.values()) {
    if (entity.kind === 'pig') {
      count += 1;
    }
  }
  return count;
}
