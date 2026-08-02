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
  scene.add(rig.object3d);

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
      material: event.result.outcome === 'blocked' || event.result.outcome === 'parried'
        ? 'metal'
        : 'flesh',
    };
    events.emit('combat:impact', payload);
    events.emit('combat:hit', payload);
    if (event.result.killed) events.emit('combat:kill', payload);
  };
  const emitSwing = (event) => events.emit('combat:swing', {
    attack: event.attack,
    weapon: controller.weapon.id,
  });
  controller.addEventListener('impact', emitImpact);
  controller.addEventListener('attackstart', emitSwing);
  const emitPlayerImpact = (event) => {
    events.emit('player:impact', event);
    events.emit('player:damage', { amount: event.result.damage, ...event });
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
      rig.object3d.position.copy(camera.position);
      rig.object3d.quaternion.copy(camera.quaternion);
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
