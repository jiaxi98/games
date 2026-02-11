import type { Vec2Like } from './types';

export const PIXELS_PER_METER = 32;
export const WORLD_WIDTH = 30;
export const WORLD_HEIGHT = 18;
export const CANVAS_WIDTH = WORLD_WIDTH * PIXELS_PER_METER;
export const CANVAS_HEIGHT = WORLD_HEIGHT * PIXELS_PER_METER;

export const GRAVITY_Y = 9.8;
export const GROUND_Y = 16.4;

export const TIME_STEP = 1 / 60;
export const VELOCITY_ITERATIONS = 8;
export const POSITION_ITERATIONS = 3;

export const SLING_ANCHOR: Vec2Like = { x: 4.2, y: 14.15 };
export const MAX_DRAG_DISTANCE = 3.2;
export const LAUNCH_POWER = 7.5;
export const MAX_LAUNCH_SPEED = 38;

export const MOTION_LINEAR_THRESHOLD = 0.18;
export const MOTION_ANGULAR_THRESHOLD = 0.22;
export const STATIONARY_FRAME_LIMIT = 125;
export const ROUND_TIMEOUT_MS = 22_000;
