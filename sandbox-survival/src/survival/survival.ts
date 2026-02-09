import type { SurvivalSnapshot } from '../contracts/game-state';

export type SurvivalState = SurvivalSnapshot;

export type SurvivalCondition =
  | 'stable'
  | 'hungry'
  | 'freezing'
  | 'overheated'
  | 'critical'
  | 'downed';

export interface SurvivalAssessment {
  condition: SurvivalCondition;
  message: string | null;
}

const MAX_STAT = 100;
const MIN_STAT = 0;
const HUNGER_DECAY_PER_SECOND = 0.6;
const STARVATION_DAMAGE_PER_SECOND = 1.6;
const COLD_DAMAGE_PER_SECOND = 1.1;
const HEAT_DAMAGE_PER_SECOND = 0.7;
const TEMPERATURE_SMOOTH_RATE = 0.45;
const HEAT_SOURCE_BOOST_PER_SECOND = 6.5;

export function createInitialSurvivalState(): SurvivalState {
  return {
    health: 100,
    hunger: 100,
    temperature: 58,
    durability: 100,
    clockMinutes: 480,
  };
}

export function tickSurvival(
  state: SurvivalState,
  deltaSeconds: number,
  nearHeatSource: boolean,
): SurvivalState {
  const clockMinutes = (state.clockMinutes + deltaSeconds * 8) % 1440;
  const ambientTemperature = computeAmbientTemperature(clockMinutes);

  const drift = (ambientTemperature - state.temperature) * TEMPERATURE_SMOOTH_RATE * deltaSeconds;
  const heatBoost = nearHeatSource ? HEAT_SOURCE_BOOST_PER_SECOND * deltaSeconds : 0;
  const temperature = clamp(state.temperature + drift + heatBoost, MIN_STAT, MAX_STAT);

  const hunger = clamp(state.hunger - HUNGER_DECAY_PER_SECOND * deltaSeconds, MIN_STAT, MAX_STAT);

  let health = state.health;
  if (hunger <= 0) {
    health -= STARVATION_DAMAGE_PER_SECOND * deltaSeconds;
  }
  if (temperature < 32) {
    health -= COLD_DAMAGE_PER_SECOND * deltaSeconds;
  }
  if (temperature > 78) {
    health -= HEAT_DAMAGE_PER_SECOND * deltaSeconds;
  }

  return {
    ...state,
    health: clamp(health, MIN_STAT, MAX_STAT),
    hunger,
    temperature,
    clockMinutes,
  };
}

export function applyToolWear(state: SurvivalState, amount: number): SurvivalState {
  if (amount <= 0) {
    return state;
  }

  return {
    ...state,
    durability: clamp(state.durability - amount, MIN_STAT, MAX_STAT),
  };
}

export function canUseTool(state: SurvivalState): boolean {
  return state.health > 0 && state.durability > 0.1;
}

export function isDowned(state: SurvivalState): boolean {
  return state.health <= 0.1;
}

export function assessSurvivalState(state: SurvivalState): SurvivalAssessment {
  if (isDowned(state)) {
    return {
      condition: 'downed',
      message: 'downed - press R to recover or L to load',
    };
  }

  if (state.health < 24) {
    return {
      condition: 'critical',
      message: 'critical health',
    };
  }

  if (state.hunger < 20) {
    return {
      condition: 'hungry',
      message: 'hunger low',
    };
  }

  if (state.temperature < 33) {
    return {
      condition: 'freezing',
      message: 'temperature low',
    };
  }

  if (state.temperature > 78) {
    return {
      condition: 'overheated',
      message: 'temperature high',
    };
  }

  return {
    condition: 'stable',
    message: null,
  };
}

export function recoverFromDowned(state: SurvivalState): SurvivalState {
  if (!isDowned(state)) {
    return state;
  }

  return {
    ...state,
    health: 56,
    hunger: Math.max(state.hunger, 50),
    temperature: 52,
    durability: Math.max(state.durability, 35),
  };
}

function computeAmbientTemperature(clockMinutes: number): number {
  const cycle = (clockMinutes / 1440) * Math.PI * 2;
  return 46 + 16 * Math.sin(cycle - Math.PI / 2);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
