import {
  ROUND_TIMEOUT_MS,
  STATIONARY_FRAME_LIMIT,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from './constants';
import { hasMeaningfulMotion, shouldCountStationaryFrame } from './round';
import { countAliveTargets, type PhysicsScene } from './scene';
import type { GamePhase, GameResult } from './types';

export interface RoundSnapshot {
  phase: GamePhase;
  result: GameResult;
  launchedAtMs: number;
  stationaryFrames: number;
}

export interface RoundRules {
  worldWidth: number;
  worldHeight: number;
  roundTimeoutMs: number;
  stationaryFrameLimit: number;
}

export const DEFAULT_ROUND_RULES: RoundRules = {
  worldWidth: WORLD_WIDTH,
  worldHeight: WORLD_HEIGHT,
  roundTimeoutMs: ROUND_TIMEOUT_MS,
  stationaryFrameLimit: STATIONARY_FRAME_LIMIT,
};

export function evaluateRoundState(
  scene: PhysicsScene,
  snapshot: RoundSnapshot,
  nowMs: number,
  rules: RoundRules = DEFAULT_ROUND_RULES,
): RoundSnapshot {
  if (snapshot.phase !== 'launched') {
    return snapshot;
  }

  const targetsRemaining = countAliveTargets(scene);
  if (targetsRemaining === 0) {
    return {
      ...snapshot,
      phase: 'resolved',
      result: 'victory',
    };
  }

  const birdVelocity = scene.bird.body.getLinearVelocity().length();
  const birdAngularVelocity = Math.abs(scene.bird.body.getAngularVelocity());
  const hasOtherMotion = hasMeaningfulMotion(scene, { excludeEntityIds: [scene.bird.id] });
  const stationaryFrames = shouldCountStationaryFrame(birdVelocity, birdAngularVelocity, hasOtherMotion)
    ? snapshot.stationaryFrames + 1
    : 0;

  const birdPos = scene.bird.body.getPosition();
  const outOfBounds =
    birdPos.x < -2 ||
    birdPos.x > rules.worldWidth + 2 ||
    birdPos.y < -2 ||
    birdPos.y > rules.worldHeight + 2;
  const timedOut = nowMs - snapshot.launchedAtMs > rules.roundTimeoutMs;
  const canResolveByOutOfBounds = outOfBounds && !hasOtherMotion;
  if (canResolveByOutOfBounds || timedOut || stationaryFrames > rules.stationaryFrameLimit) {
    return {
      ...snapshot,
      stationaryFrames,
      phase: 'resolved',
      result: 'defeat',
    };
  }

  return {
    ...snapshot,
    stationaryFrames,
  };
}

export function flushDestroyedBodies(scene: PhysicsScene, pendingDestroy: Set<string>): number {
  let scoreDelta = 0;
  for (const entityId of pendingDestroy) {
    const entity = scene.entities.get(entityId);
    if (!entity) {
      continue;
    }
    scoreDelta += entity.scoreValue;
    scene.bodyToEntity.delete(entity.body);
    scene.world.destroyBody(entity.body);
    scene.entities.delete(entityId);
  }
  pendingDestroy.clear();
  return scoreDelta;
}
