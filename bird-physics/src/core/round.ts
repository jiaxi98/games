import { MOTION_ANGULAR_THRESHOLD, MOTION_LINEAR_THRESHOLD } from './constants';
import type { PhysicsScene } from './scene';
import type { GamePhase, GameResult } from './types';

export interface MotionQueryOptions {
  excludeEntityIds?: readonly string[];
  linearThreshold?: number;
  angularThreshold?: number;
}

export function hasMeaningfulMotion(scene: PhysicsScene, options: MotionQueryOptions = {}): boolean {
  const excludeIds = new Set(options.excludeEntityIds ?? []);
  const linearThreshold = options.linearThreshold ?? MOTION_LINEAR_THRESHOLD;
  const angularThreshold = options.angularThreshold ?? MOTION_ANGULAR_THRESHOLD;

  for (const entity of scene.entities.values()) {
    if (excludeIds.has(entity.id)) {
      continue;
    }

    const body = entity.body;
    if (body.getType() === 'static') {
      continue;
    }

    const linearSpeed = body.getLinearVelocity().length();
    const angularSpeed = Math.abs(body.getAngularVelocity());
    if (linearSpeed >= linearThreshold || angularSpeed >= angularThreshold) {
      return true;
    }
  }

  return false;
}

export function shouldCountStationaryFrame(
  birdLinearSpeed: number,
  birdAngularSpeed: number,
  hasOtherMotion: boolean,
): boolean {
  const birdAlmostStill =
    birdLinearSpeed < MOTION_LINEAR_THRESHOLD && birdAngularSpeed < MOTION_ANGULAR_THRESHOLD;
  return birdAlmostStill && !hasOtherMotion;
}

export function phaseLabel(phase: GamePhase, result: GameResult): string {
  if (phase === 'resolved') {
    return result === 'victory' ? 'Resolved (Victory)' : 'Resolved (Defeat)';
  }
  return phase[0].toUpperCase() + phase.slice(1);
}

export function phaseMessage(phase: GamePhase, result: GameResult): string {
  switch (phase) {
    case 'idle':
      return 'Grab the bird and pull backward.';
    case 'aiming':
      return 'Release to launch.';
    case 'launched':
      return 'Flight in progress.';
    case 'resolved':
      return result === 'victory' ? 'All pigs eliminated.' : 'No more effective motion.';
  }
}
