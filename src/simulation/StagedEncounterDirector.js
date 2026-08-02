import { EventDispatcher } from 'three';

/**
 * Activates already-positioned simulation squads when mission state and
 * player proximity make a route beat relevant. Squads remain rendered while
 * dormant, so activation changes behavior and targetability rather than
 * making a formation visibly pop into existence.
 */
export class StagedEncounterDirector extends EventDispatcher {
  constructor({ simulation } = {}) {
    super();
    if (!simulation) throw new Error('StagedEncounterDirector requires a simulation.');
    this.simulation = simulation;
    this.beats = [];
    this.captainEncounter = null;
    this.stage = null;
    this.playerPosition = null;
    this._disposed = false;
  }

  addBeat({
    id,
    stages,
    position = null,
    radius = Infinity,
    squads = [],
    onActivate = null,
  } = {}) {
    if (!id) throw new Error('Encounter beats require an id.');
    const beat = {
      id,
      stages: normalizeStages(stages),
      position,
      radius: Math.max(0, Number(radius) || 0),
      squads: normalizeSquads(this.simulation, squads),
      onActivate,
      active: false,
      activatedAtStage: null,
    };
    this.beats.push(beat);
    return beat;
  }

  setCaptainEncounter({
    id = 'captain-encounter',
    stage,
    position,
    radius = Infinity,
    captain,
    squads = [],
    phases = [],
    onActivate = null,
  } = {}) {
    if (!captain?.combatant) {
      throw new Error('Captain encounters require an actor with a combatant.');
    }
    captain.combatant.targetable = false;
    this.captainEncounter = {
      id,
      stage,
      position,
      radius: Math.max(0, Number(radius) || 0),
      captain,
      squads: normalizeSquads(this.simulation, squads),
      phases: normalizePhases(phases),
      onActivate,
      active: false,
      phase: null,
    };
    return this.captainEncounter;
  }

  update(_dt, {
    stage = this.stage,
    playerPosition = this.playerPosition,
  } = {}) {
    if (this._disposed) return;
    this.stage = stage;
    this.playerPosition = playerPosition;

    for (const beat of this.beats) {
      if (
        beat.active
        || !beat.stages.has(stage)
        || !withinTrigger(playerPosition, resolvePosition(beat.position), beat.radius)
      ) continue;
      this.activateBeat(beat.id);
    }

    const encounter = this.captainEncounter;
    if (!encounter) return;
    if (
      !encounter.active
      && encounter.stage === stage
      && withinTrigger(playerPosition, resolvePosition(encounter.position), encounter.radius)
    ) {
      this.activateCaptainEncounter();
    }
    if (encounter.active) this._updateCaptainPhase();
  }

  activateBeat(id) {
    const beat = this.beats.find((entry) => entry.id === id);
    if (!beat || beat.active) return false;
    beat.active = true;
    beat.activatedAtStage = this.stage;
    for (const squad of beat.squads) this.simulation.setSquadActive(squad, true);
    beat.onActivate?.({
      beat,
      stage: this.stage,
      playerPosition: this.playerPosition,
      simulation: this.simulation,
    });
    this.dispatchEvent({
      type: 'activate',
      id: beat.id,
      beat,
      stage: this.stage,
    });
    return true;
  }

  activateCaptainEncounter() {
    const encounter = this.captainEncounter;
    if (!encounter || encounter.active) return false;
    encounter.active = true;
    for (const squad of encounter.squads) this.simulation.setSquadActive(squad, true);
    encounter.captain.combatant.targetable = true;
    encounter.onActivate?.({
      encounter,
      stage: this.stage,
      playerPosition: this.playerPosition,
      simulation: this.simulation,
    });
    this.dispatchEvent({
      type: 'captainactivate',
      id: encounter.id,
      encounter,
      stage: this.stage,
    });
    this._updateCaptainPhase(true);
    return true;
  }

  getBeat(id) {
    return this.beats.find((entry) => entry.id === id) ?? null;
  }

  getCaptainPhase() {
    return this.captainEncounter?.phase ?? null;
  }

  snapshot() {
    return {
      stage: this.stage,
      beats: this.beats.map((beat) => ({
        id: beat.id,
        active: beat.active,
        activatedAtStage: beat.activatedAtStage,
      })),
      captain: this.captainEncounter
        ? {
          id: this.captainEncounter.id,
          active: this.captainEncounter.active,
          phase: this.captainEncounter.phase,
          targetable: this.captainEncounter.captain.combatant.targetable,
        }
        : null,
    };
  }

  dispose() {
    this.beats.length = 0;
    this.captainEncounter = null;
    this._disposed = true;
  }

  _updateCaptainPhase(force = false) {
    const encounter = this.captainEncounter;
    const combatant = encounter?.captain?.combatant;
    if (!encounter?.active || !combatant?.alive) return;
    const ratio = combatant.maxHealth > 0
      ? combatant.health / combatant.maxHealth
      : 0;
    const next = encounter.phases.find((phase) => ratio <= phase.atOrBelow)
      ?? encounter.phases.at(-1)
      ?? null;
    if (!next || (!force && encounter.phase === next.id)) return;
    const previous = encounter.phase;
    encounter.phase = next.id;
    next.onEnter?.({
      encounter,
      captain: encounter.captain,
      previous,
      phase: next.id,
      healthRatio: ratio,
      playerPosition: this.playerPosition,
      simulation: this.simulation,
    });
    this.dispatchEvent({
      type: 'captainphase',
      id: encounter.id,
      encounter,
      previous,
      phase: next.id,
      healthRatio: ratio,
    });
  }
}

function normalizeStages(stages) {
  if (stages instanceof Set) return new Set(stages);
  if (Array.isArray(stages)) return new Set(stages);
  return new Set(stages === undefined ? [] : [stages]);
}

function normalizeSquads(simulation, squads) {
  return squads
    .map((squad) => (
      typeof squad === 'string' ? simulation.getSquad(squad) : squad
    ))
    .filter(Boolean);
}

function normalizePhases(phases) {
  return phases
    .map((phase) => ({
      ...phase,
      atOrBelow: Math.max(0, Math.min(1, Number(phase.atOrBelow) || 0)),
    }))
    .sort((a, b) => a.atOrBelow - b.atOrBelow);
}

function resolvePosition(position) {
  return typeof position === 'function' ? position() : position;
}

function withinTrigger(playerPosition, triggerPosition, radius) {
  if (!triggerPosition || !Number.isFinite(radius)) return true;
  if (!playerPosition) return false;
  const dx = playerPosition.x - triggerPosition.x;
  const dz = playerPosition.z - triggerPosition.z;
  return dx * dx + dz * dz <= radius * radius;
}

export default StagedEncounterDirector;
