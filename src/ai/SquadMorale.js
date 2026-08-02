import { EventDispatcher } from 'three';

export const CohesionState = Object.freeze({
  ORDERED: 'ordered',
  PRESSURED: 'pressured',
  FRACTURED: 'fractured',
  ROUTED: 'routed',
});

export const COHESION_THRESHOLDS = Object.freeze({
  ordered: 0.72,
  pressured: 0.43,
  fractured: 0.18,
});

export class SquadMorale extends EventDispatcher {
  constructor({
    initial = 0.9,
    discipline = 0.6,
    recoverRate = 0.035,
    hysteresis = 0.045,
  } = {}) {
    super();
    this.value = clamp01(initial);
    this.discipline = clamp01(discipline);
    this.recoverRate = recoverRate;
    this.hysteresis = hysteresis;
    this.state = stateFor(this.value);
    this.casualtyShock = 0;
    this.missilePressure = 0;
    this.flankPressure = 0;
    this.commandBonus = 0;
    this.standardBonus = 0;
    this._holdRouted = 0;
  }

  applyCasualty({ officer = false, nearby = true } = {}) {
    this.casualtyShock = Math.min(
      1,
      this.casualtyShock + (officer ? 0.48 : nearby ? 0.13 : 0.055),
    );
    if (officer) this.value = Math.max(0, this.value - 0.16);
  }

  applyShock(amount) {
    this.value = clamp01(this.value - Math.max(0, amount));
  }

  rally(strength = 0.22) {
    this.value = clamp01(this.value + Math.max(0, strength));
    this.casualtyShock *= 0.45;
    this._holdRouted = 0;
    this._setState(stateFor(this.value));
  }

  update(dt, {
    casualtyRatio = 0,
    localOutnumbered = 0,
    flankPressure = 0,
    missilePressure = 0,
    officerAlive = true,
    standardPresent = false,
    playerPresence = 0,
    braced = false,
    advancing = false,
    enemyRoutedNearby = false,
  } = {}) {
    this.casualtyShock = Math.max(0, this.casualtyShock - dt * (0.14 + this.discipline * 0.1));
    this.flankPressure = approach(this.flankPressure, flankPressure, dt * 1.8);
    this.missilePressure = approach(this.missilePressure, missilePressure, dt * 1.4);
    this.standardBonus = approach(this.standardBonus, standardPresent ? 1 : 0, dt * 2);
    this.commandBonus = approach(this.commandBonus, playerPresence, dt * 2);

    const pressure =
      casualtyRatio * 0.28 +
      Math.max(0, localOutnumbered) * 0.13 +
      this.flankPressure * 0.18 +
      this.missilePressure * 0.11 +
      this.casualtyShock * 0.38 +
      (officerAlive ? 0 : 0.16);
    const support =
      this.discipline * 0.045 +
      this.standardBonus * 0.075 +
      this.commandBonus * 0.095 +
      (braced ? 0.045 : 0) +
      (advancing ? 0.018 : 0) +
      (enemyRoutedNearby ? 0.08 : 0);

    const recovery = pressure < 0.1 ? this.recoverRate + support : support * 0.5;
    this.value = clamp01(this.value + (recovery - pressure * 0.32) * dt);

    if (this.state === CohesionState.ROUTED) {
      this._holdRouted += dt;
      if (this._holdRouted < 2.5 && this.value < 0.32) return this.state;
    }
    this._setState(stateForWithHysteresis(this.value, this.state, this.hysteresis));
    return this.state;
  }

  snapshot() {
    return {
      value: this.value,
      state: this.state,
      casualtyShock: this.casualtyShock,
      flankPressure: this.flankPressure,
      missilePressure: this.missilePressure,
    };
  }

  _setState(next) {
    if (next === this.state) return;
    const previous = this.state;
    this.state = next;
    this._holdRouted = next === CohesionState.ROUTED ? 0 : this._holdRouted;
    this.dispatchEvent({ type: 'statechange', previous, state: next, value: this.value });
  }
}

function stateFor(value) {
  if (value >= COHESION_THRESHOLDS.ordered) return CohesionState.ORDERED;
  if (value >= COHESION_THRESHOLDS.pressured) return CohesionState.PRESSURED;
  if (value >= COHESION_THRESHOLDS.fractured) return CohesionState.FRACTURED;
  return CohesionState.ROUTED;
}

function stateForWithHysteresis(value, previous, hysteresis) {
  if (previous === CohesionState.ROUTED && value < COHESION_THRESHOLDS.fractured + hysteresis) {
    return previous;
  }
  if (previous === CohesionState.FRACTURED) {
    if (value < COHESION_THRESHOLDS.fractured - hysteresis) return CohesionState.ROUTED;
    if (value < COHESION_THRESHOLDS.pressured + hysteresis) return previous;
  }
  if (previous === CohesionState.PRESSURED) {
    if (value < COHESION_THRESHOLDS.pressured - hysteresis) return CohesionState.FRACTURED;
    if (value < COHESION_THRESHOLDS.ordered + hysteresis) return previous;
  }
  if (previous === CohesionState.ORDERED && value >= COHESION_THRESHOLDS.ordered - hysteresis) {
    return previous;
  }
  return stateFor(value);
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function approach(value, target, amount) {
  if (value < target) return Math.min(target, value + amount);
  return Math.max(target, value - amount);
}

