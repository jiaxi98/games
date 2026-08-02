export const BattlePhase = Object.freeze({
  OPENING: 'opening',
  STANDARD: 'standard',
  RALLY: 'rally',
  SPEAR_LINE: 'spear_line',
  FORD: 'ford',
  VICTORY: 'victory',
});

export const BATTLE_PHASES = Object.freeze({
  [BattlePhase.OPENING]: Object.freeze({
    id: BattlePhase.OPENING,
    label: 'Vanguard scattered',
    intensity: 0.8,
  }),
  [BattlePhase.STANDARD]: Object.freeze({
    id: BattlePhase.STANDARD,
    label: 'Standard recovered',
    intensity: 0.95,
  }),
  [BattlePhase.RALLY]: Object.freeze({
    id: BattlePhase.RALLY,
    label: 'Hedgerow rally',
    intensity: 0.82,
  }),
  [BattlePhase.SPEAR_LINE]: Object.freeze({
    id: BattlePhase.SPEAR_LINE,
    label: 'Spear line engaged',
    intensity: 1,
  }),
  [BattlePhase.FORD]: Object.freeze({
    id: BattlePhase.FORD,
    label: 'Ford assault',
    intensity: 0.9,
  }),
  [BattlePhase.VICTORY]: Object.freeze({
    id: BattlePhase.VICTORY,
    label: 'Enemy routed',
    intensity: 0.35,
  }),
});

export function getBattlePhase(phase) {
  return BATTLE_PHASES[phase] ?? BATTLE_PHASES[BattlePhase.OPENING];
}

export function createBattlePhaseEvent(phase, detail = {}) {
  const definition = BATTLE_PHASES[phase];
  if (!definition) {
    return {
      phase,
      label: String(phase ?? '').replaceAll('_', ' '),
      intensity: detail.intensity,
      ...detail,
    };
  }
  return {
    phase: definition.id,
    label: definition.label,
    intensity: definition.intensity,
    ...detail,
  };
}
