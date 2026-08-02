import { Vector3 } from 'three';
import { Combatant, DamageType } from './Combatant.js';
import { createFirstPersonWeaponRig } from './FirstPersonWeaponRig.js';
import { MeleeCombatController } from './MeleeCombatController.js';

export const name = 'first-person-melee';

export function install(context) {
  const { scene, camera, player, input, events, app } = context;
  const combatant = new Combatant({
    id: 'player',
    factionId: 1,
    maxHealth: 120,
    maxStamina: 110,
    staminaRegen: 26,
    armor: {
      [DamageType.CUT]: 0.24,
      [DamageType.PIERCE]: 0.15,
      [DamageType.BLUNT]: 0.08,
    },
    poise: 42,
    positionProvider: () => player.position,
  });
  combatant.actor = player;
  player.combatant = combatant;
  player.factionId = combatant.factionId;

  const proxy = {
    id: combatant.id,
    factionId: combatant.factionId,
    combatant,
    object3d: { position: player.position },
    role: 'player',
    get combatState() {
      return controller.getSnapshot();
    },
  };
  const controller = new MeleeCombatController({
    owner: combatant,
    weapon: 'longsword',
    queryTargets: (origin, radius) => (
      app.battlefieldSimulation?.queryCombatants(origin, radius) ?? []
    ),
    getOrigin: () => camera.position,
    getForward: () => camera.getWorldDirection(_forward),
  });
  const rig = createFirstPersonWeaponRig({ weapon: 'longsword' });
  // The weapon is view-space presentation. Parenting it to the camera keeps
  // the rig stable under head bob and prevents it from clipping through world
  // geometry because of a one-frame camera/world transform mismatch.
  camera.add(rig.object3d);
  if (!camera.parent) scene.add(camera);

  let unregisterExternal = null;
  const connectBattlefield = (simulation) => {
    unregisterExternal?.();
    unregisterExternal = simulation?.registerExternalActor(proxy) ?? null;
  };
  connectBattlefield(app.battlefieldSimulation);
  const unsubscribeBattlefield = events.on('battlefield:ready', connectBattlefield);

  const emitImpact = (event) => {
    const payload = {
      attacker: combatant,
      target: event.target,
      attack: event.attack,
      result: event.result,
      point: event.result.point,
      position: event.result.point,
      hitZone: event.result.hitZone,
      surface: event.result.surface,
      material: event.result.material,
      severity: event.result.severity,
      intensity: event.result.intensity,
      outcome: event.result.outcome,
      direction: event.result.direction,
      hitStop: event.hitStop,
    };
    rig.applyImpulse?.(payload);
    player.applyCombatImpulse?.({
      direction: payload.direction,
      intensity: payload.severity,
      hitStop: payload.hitStop,
      recoil: payload.outcome === 'parried' ? 1.5 : 1,
    });
    events.emit('combat:impact', payload);
    if (event.result.killed) events.emit('combat:kill', payload);
  };
  const emitSwing = (event) => events.emit('combat:swing', {
    attack: event.attack,
    weapon: controller.weapon.id,
  });
  controller.addEventListener('impact', emitImpact);
  controller.addEventListener('attackstart', emitSwing);
  const emitPlayerImpact = (event) => {
    const damagePayload = normalizeIncomingDamage(event, player, camera);
    rig.applyImpulse?.({
      intensity: damagePayload.intensity,
      direction: damagePayload.direction,
    });
    player.applyCombatImpulse?.({
      direction: damagePayload.direction,
      intensity: damagePayload.intensity,
      hitStop: damagePayload.hitStop,
      recoil: 1.25,
    });
    events.emit('player:impact', event);
    events.emit('player:damage', damagePayload);
    events.emit('player:health', {
      value: combatant.health,
      max: combatant.maxHealth,
      ratio: combatant.health / combatant.maxHealth,
    });
  };
  const emitPlayerDeath = (event) => {
    events.emit('player:death', event);
    events.emit('death', event);
  };
  combatant.addEventListener('impact', emitPlayerImpact);
  combatant.addEventListener('death', emitPlayerDeath);

  const api = Object.freeze({
    combatant,
    controller,
    lightAttack: () => controller.lightAttack(),
    heavyAttack: () => controller.heavyAttack(),
    beginBlock: () => controller.beginBlock(),
    endBlock: () => controller.endBlock(),
    getSnapshot: () => ({
      health: combatant.health,
      maxHealth: combatant.maxHealth,
      stamina: combatant.stamina,
      maxStamina: combatant.maxStamina,
      weaponState: controller.state,
      combatState: controller.getSnapshot(),
    }),
  });
  app.playerCombat = api;
  events.emit('combat:ready', api);

  return {
    update(dt) {
      if (input.wasPressed('attack')) {
        if (input.isDown('sprint')) controller.heavyAttack();
        else controller.lightAttack();
      }
      if (input.wasPressed('guard')) controller.beginBlock();
      if (input.wasReleased('guard')) controller.endBlock();
      controller.update(dt);
      rig.update(dt, controller.getPose());
    },
    dispose() {
      unregisterExternal?.();
      unsubscribeBattlefield();
      controller.removeEventListener('impact', emitImpact);
      controller.removeEventListener('attackstart', emitSwing);
      combatant.removeEventListener('impact', emitPlayerImpact);
      combatant.removeEventListener('death', emitPlayerDeath);
      controller.dispose();
      rig.dispose();
      delete player.combatant;
      delete player.factionId;
      if (app.playerCombat === api) delete app.playerCombat;
    },
  };
}

export default { name, install };

const _forward = new Vector3();
const _incoming = new Vector3();
const _planarForward = new Vector3();
const _planarRight = new Vector3();

function normalizeIncomingDamage(event, player, camera) {
  const impact = event.impact ?? {};
  const result = event.result ?? {};
  const direction = normalizeDirection(
    impact.direction ?? result.direction,
    player.position,
    impact.source?.position,
  );
  camera.getWorldDirection(_planarForward);
  _planarForward.y = 0;
  if (_planarForward.lengthSq() < 1e-8) _planarForward.set(0, 0, -1);
  else _planarForward.normalize();
  _planarRight.crossVectors(_planarForward, _worldUp).normalize();
  const incoming = _incoming.copy(direction).multiplyScalar(-1);
  const angle = Math.atan2(incoming.dot(_planarRight), incoming.dot(_planarForward)) * 180 / Math.PI;
  const intensity = clamp01(
    result.intensity
    ?? result.severity
    ?? impact.intensity
    ?? impact.severity
    ?? (result.damage ?? impact.damage ?? 0) / 45,
  );
  return {
    amount: result.damage ?? impact.damage ?? 0,
    intensity,
    severity: intensity,
    direction: direction.clone(),
    angle,
    point: result.point ?? impact.point,
    position: result.point ?? impact.point,
    hitZone: result.hitZone ?? impact.hitZone ?? 'torso',
    surface: result.surface ?? impact.surface ?? 'flesh',
    material: result.material ?? impact.material ?? 'flesh',
    outcome: result.outcome ?? 'hit',
    hitStop: clamp01(intensity) * 0.035,
    ...event,
    direction: direction.clone(),
    angle,
    intensity,
    severity: intensity,
  };
}

function normalizeDirection(value, playerPosition, sourcePosition) {
  if (value?.isVector3) {
    return _incoming.copy(value).normalize();
  }
  if (Array.isArray(value)) return _incoming.fromArray(value).normalize();
  if (value && Number.isFinite(value.x) && Number.isFinite(value.z)) {
    return _incoming.set(value.x, value.y ?? 0, value.z).normalize();
  }
  if (sourcePosition?.isVector3) return _incoming.copy(playerPosition).sub(sourcePosition).normalize();
  if (sourcePosition && Number.isFinite(sourcePosition.x) && Number.isFinite(sourcePosition.z)) {
    return _incoming.set(
      playerPosition.x - sourcePosition.x,
      playerPosition.y - (sourcePosition.y ?? playerPosition.y),
      playerPosition.z - sourcePosition.z,
    ).normalize();
  }
  return _incoming.set(0, 0, -1);
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

const _worldUp = new Vector3(0, 1, 0);
