import { EventDispatcher, Vector3 } from 'three';
import { Formation, FormationType } from '../ai/Formation.js';
import { CohesionState, SquadMorale } from '../ai/SquadMorale.js';

export const SquadOrder = Object.freeze({
  HOLD: 'hold',
  ADVANCE: 'advance',
  BRACE: 'brace',
  RALLY: 'rally',
  FOCUS: 'focus',
  RETREAT: 'retreat',
});

export class SquadController extends EventDispatcher {
  constructor({
    id,
    factionId,
    actors = [],
    formation = FormationType.LINE,
    anchor = new Vector3(),
    forward = new Vector3(0, 0, 1),
    retreatPoint,
    morale,
    officer = null,
    standardBearer = null,
  } = {}) {
    super();
    this.id = id;
    this.factionId = factionId;
    this.actors = actors;
    this.anchor = anchor.clone();
    this.forward = forward.clone().setY(0).normalize();
    this.retreatPoint = retreatPoint?.clone() ?? anchor.clone().addScaledVector(this.forward, -45);
    this.formation = formation instanceof Formation ? formation : new Formation({
      type: formation,
      frontage: formation === FormationType.SPEAR_WALL ? 8 : 6,
    });
    this.morale = morale instanceof SquadMorale ? morale : new SquadMorale(morale);
    this.officer = officer;
    this.standardBearer = standardBearer;
    this.order = SquadOrder.HOLD;
    this.orderTarget = this.anchor.clone();
    this.focusTarget = null;
    this.initialCount = actors.length;
    this.casualties = 0;
    this.enemyPressure = 0;
    this.flankPressure = 0;
    this.observedFlankPressure = 0;
    this.playerPresence = 0;
    this._deadIds = new Set();
    this._slot = new Vector3();
    this._center = new Vector3();
    this._lastState = this.morale.state;
    this.morale.addEventListener('statechange', (event) => {
      this.dispatchEvent({
        type: 'cohesionchange',
        squad: this,
        previous: event.previous,
        state: event.state,
        value: event.value,
      });
    });
    actors.forEach((actor) => {
      actor.squad = this;
      actor.combatant.squad = this;
      if (actor.brain) actor.brain.actor = actor;
    });
  }

  issueOrder(order, {
    target = null,
    focusTarget = null,
    strength = 0.22,
  } = {}) {
    this.order = order;
    if (target) this.orderTarget.copy(target);
    if (focusTarget) this.focusTarget = focusTarget;
    if (order === SquadOrder.RALLY) this.morale.rally(strength);
    if (order === SquadOrder.RETREAT) this.morale.applyShock(0.04);
    this.dispatchEvent({ type: 'order', squad: this, order, target, focusTarget });
  }

  applyBattlefieldEvent(type, amount = 1) {
    if (type === 'flanked') this.flankPressure = Math.min(1, this.flankPressure + amount);
    if (type === 'missile-volley') this.morale.missilePressure = Math.min(1, this.morale.missilePressure + amount);
    if (type === 'standard-raised') this.morale.rally(0.24 * amount);
    if (type === 'officer-killed') {
      this.morale.applyCasualty({ officer: true });
      this.officer = null;
    }
    if (type === 'enemy-broken') this.morale.rally(0.12 * amount);
  }

  update(dt, context = {}) {
    const alive = this.actors.filter((actor) => actor.combatant.alive);
    for (const actor of this.actors) {
      if (!actor.combatant.alive && !this._deadIds.has(actor.id)) {
        this._deadIds.add(actor.id);
        this.casualties += 1;
        this.morale.applyCasualty({
          officer: actor === this.officer,
          nearby: true,
        });
        if (actor === this.officer) this.officer = null;
        if (actor === this.standardBearer) this.standardBearer = null;
        this.dispatchEvent({ type: 'casualty', squad: this, actor });
      }
    }

    this._computeCenter(alive);
    const casualtyRatio = this.initialCount > 0 ? this.casualties / this.initialCount : 1;
    const playerDistance = context.playerPosition
      ? context.playerPosition.distanceTo(this._center)
      : Infinity;
    this.playerPresence = playerDistance < 12 && context.playerFactionId === this.factionId
      ? 1 - playerDistance / 12
      : 0;

    const previousState = this.morale.state;
    this.morale.update(dt, {
      casualtyRatio,
      localOutnumbered: this.enemyPressure,
      flankPressure: Math.max(this.flankPressure, this.observedFlankPressure),
      missilePressure: context.missilePressure ?? 0,
      officerAlive: Boolean(this.officer?.combatant.alive),
      standardPresent: Boolean(this.standardBearer?.combatant.alive || context.standardPresent),
      playerPresence: this.playerPresence,
      braced: this.order === SquadOrder.BRACE,
      advancing: this.order === SquadOrder.ADVANCE,
      enemyRoutedNearby: context.enemyRoutedNearby,
    });
    this.flankPressure = Math.max(0, this.flankPressure - dt * 0.32);
    this.observedFlankPressure = 0;

    if (previousState !== CohesionState.ROUTED && this.morale.state === CohesionState.ROUTED) {
      this.order = SquadOrder.RETREAT;
      this.dispatchEvent({ type: 'rout', squad: this });
    }

    if (this.order === SquadOrder.ADVANCE && this.morale.state !== CohesionState.ROUTED) {
      _delta.copy(this.orderTarget).sub(this.anchor);
      _delta.y = 0;
      const distance = _delta.length();
      if (distance > 0.1) {
        const step = Math.min(distance, dt * (this.morale.state === CohesionState.FRACTURED ? 0.8 : 1.65));
        this.anchor.addScaledVector(_delta.multiplyScalar(1 / distance), step);
        this.forward.lerp(_delta, Math.min(1, dt * 2.5)).normalize();
      } else {
        this.order = SquadOrder.HOLD;
      }
    }

    const activeActors = alive.filter((actor) => actor.brain);
    activeActors.forEach((actor, index) => {
      this.formation.worldSlot(
        index,
        activeActors.length,
        this.morale.state,
        this.anchor,
        this.forward,
        this._slot,
      );
      actor.brain.setFocusTarget(this.focusTarget);
      actor.brain.update(dt, {
        slot: this._slot,
        anchor: this.anchor,
        forward: this.forward,
        retreatPoint: this.retreatPoint,
        cohesionState: this.morale.state,
        advance: this.order === SquadOrder.ADVANCE,
        braced: this.order === SquadOrder.BRACE,
        focusTarget: this.focusTarget,
        lod: actor.lod,
        senseRange: this.morale.state === CohesionState.ORDERED ? 11 : 16,
      });
    });
    return this.morale.state;
  }

  get center() {
    return this._center;
  }

  snapshot() {
    return {
      id: this.id,
      factionId: this.factionId,
      order: this.order,
      cohesion: this.morale.snapshot(),
      alive: this.initialCount - this.casualties,
      casualties: this.casualties,
      center: this._center.clone(),
    };
  }

  dispose() {
    this.actors.forEach((actor) => actor.brain?.dispose());
    this.actors.length = 0;
  }

  _computeCenter(actors) {
    this._center.set(0, 0, 0);
    if (actors.length === 0) {
      this._center.copy(this.anchor);
      return;
    }
    actors.forEach((actor) => this._center.add(actor.object3d.position));
    this._center.multiplyScalar(1 / actors.length);
  }
}

const _delta = new Vector3();
