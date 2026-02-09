import type { PlayerSnapshot, Vec3 } from '../contracts/game-state';
import type { ChunkCoord } from '../core/world';
import { CHUNK_SIZE } from '../world/resources';
import type { WorldBounds } from '../world/world-state';

export interface MovementInput {
  forward: number;
  strafe: number;
  sprint: boolean;
}

export type PlayerState = PlayerSnapshot;

export const PLAYER_EYE_HEIGHT = 1.7;
const BASE_SPEED = 4.2;
const SPRINT_MULTIPLIER = 1.45;
const MAX_PITCH = Math.PI / 2 - 0.01;

export function createInitialPlayerState(spawnChunk: ChunkCoord): PlayerState {
  return {
    position: {
      x: spawnChunk.x * CHUNK_SIZE,
      y: PLAYER_EYE_HEIGHT,
      z: spawnChunk.z * CHUNK_SIZE,
    },
    yaw: 0,
    pitch: 0,
  };
}

export function applyLookDelta(
  state: PlayerState,
  deltaX: number,
  deltaY: number,
  sensitivity = 0.0022,
): PlayerState {
  const yaw = state.yaw - deltaX * sensitivity;
  const pitch = clamp(state.pitch - deltaY * sensitivity, -MAX_PITCH, MAX_PITCH);

  return {
    ...state,
    yaw,
    pitch,
  };
}

export function stepPlayer(
  state: PlayerState,
  movement: MovementInput,
  deltaSeconds: number,
  bounds: WorldBounds,
): PlayerState {
  const forwardX = -Math.sin(state.yaw);
  const forwardZ = -Math.cos(state.yaw);
  const rightX = Math.cos(state.yaw);
  const rightZ = -Math.sin(state.yaw);

  const xAxis = movement.forward * forwardX + movement.strafe * rightX;
  const zAxis = movement.forward * forwardZ + movement.strafe * rightZ;
  const axisLength = Math.hypot(xAxis, zAxis);

  const normalizedX = axisLength > 0 ? xAxis / axisLength : 0;
  const normalizedZ = axisLength > 0 ? zAxis / axisLength : 0;

  const speed = BASE_SPEED * (movement.sprint ? SPRINT_MULTIPLIER : 1);
  const dx = normalizedX * speed * deltaSeconds;
  const dz = normalizedZ * speed * deltaSeconds;

  const margin = 0.8;

  return {
    ...state,
    position: {
      x: clamp(state.position.x + dx, bounds.minX + margin, bounds.maxX - margin),
      y: PLAYER_EYE_HEIGHT,
      z: clamp(state.position.z + dz, bounds.minZ + margin, bounds.maxZ - margin),
    },
  };
}

export function formatPlayerPosition(position: Vec3): string {
  return `x:${position.x.toFixed(2)} y:${position.y.toFixed(2)} z:${position.z.toFixed(2)}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
