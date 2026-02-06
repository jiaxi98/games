import * as planck from 'planck';
import { GRAVITY_Y, GROUND_Y, SLING_ANCHOR, WORLD_WIDTH } from './constants';
import type { PhysicsEntity } from './types';

export interface PhysicsScene {
  world: planck.World;
  anchor: planck.Vec2;
  bird: PhysicsEntity;
  entities: Map<string, PhysicsEntity>;
  bodyToEntity: Map<planck.Body, PhysicsEntity>;
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

  const nextWoodId = createEntityIdFactory('wood');
  const nextPigId = createEntityIdFactory('pig');

  const ground = world.createBody();
  ground.createFixture(planck.Edge(planck.Vec2(0, GROUND_Y), planck.Vec2(WORLD_WIDTH, GROUND_Y)), {
    friction: 0.95,
    restitution: 0.06,
  });

  const enemyPlatform = world.createBody({ position: planck.Vec2(22, 15.95) });
  enemyPlatform.createFixture(planck.Box(5.4, 0.35), {
    friction: 0.9,
    restitution: 0.05,
  });

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
      linearDamping: 0.26,
      angularDamping: 1.2,
    });
    body.createFixture(planck.Box(hx, hy), {
      density: 0.95,
      friction: 0.72,
      restitution: 0.08,
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
      linearDamping: 0.24,
      angularDamping: 1.1,
    });
    body.createFixture(planck.Circle(0.38), {
      density: 1.2,
      friction: 0.45,
      restitution: 0.15,
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

  // Main structure and targets.
  registerWoodBlock(planck.Vec2(20.35, 14.5), 0.24, 1.4, 0.02);
  registerWoodBlock(planck.Vec2(22.1, 14.5), 0.24, 1.4, -0.02);
  registerWoodBlock(planck.Vec2(21.25, 13.25), 1.08, 0.22, 0);
  registerWoodBlock(planck.Vec2(21.25, 12.0), 0.24, 1.0, 0.05);
  registerWoodBlock(planck.Vec2(20.7, 11.0), 0.8, 0.22, 0.07);
  registerWoodBlock(planck.Vec2(21.8, 11.0), 0.8, 0.22, -0.06);
  registerWoodBlock(planck.Vec2(23.0, 15.05), 0.22, 0.9, 0.12);

  registerPig(planck.Vec2(21.2, 12.35));
  registerPig(planck.Vec2(21.2, 10.35));

  return {
    world,
    anchor,
    bird,
    entities,
    bodyToEntity,
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
