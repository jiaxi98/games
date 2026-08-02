import {
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Sprite,
  SpriteMaterial,
  Vector3,
} from 'three';
import { FactionId } from '../actors/Factions.js';
import { MissionStage, MissionState } from './MissionState.js';

export const name = 'ashen-standard-mission';

const COMMANDS = Object.freeze([
  { id: 'rally', key: 'Q / 1', label: 'Rally' },
  { id: 'brace', key: 'R / 2', label: 'Brace' },
  { id: 'advance', key: 'F / 3', label: 'Advance / Focus' },
]);

const OBJECTIVES = Object.freeze({
  [MissionStage.RECOVER]: {
    id: 'recover',
    title: 'Recover the fallen standard',
    detail: 'Reach the blue standard in the collapsed centre and press E.',
  },
  [MissionStage.RALLY]: {
    id: 'rally',
    title: 'Rally the hedgerow',
    detail: 'Bring the standard to the western hedgerow and rally nearby survivors with Q.',
  },
  [MissionStage.BREAK]: {
    id: 'break',
    title: 'Break the spear line',
    detail: 'Brace the retinue with R, then order the advance with F and fight through.',
  },
  [MissionStage.CAPTAIN]: {
    id: 'captain',
    title: 'Defeat the enemy captain',
    detail: 'Press toward the ford and bring down the captain beneath the red colours.',
  },
  [MissionStage.VICTORY]: {
    id: 'victory',
    title: 'Raise the Ashen Standard',
    detail: 'Secure the stone bridge and press E to raise the colours.',
  },
});

export function install(context) {
  let missionSystem = null;
  let disposed = false;

  const tryInstall = () => {
    if (missionSystem || disposed) return Boolean(missionSystem);
    const { app } = context;
    if (
      !app.world?.landmarks
      || !app.battlefield
      || !(app.battlefieldSimulation ?? app.battlefield.simulation)
    ) return false;
    missionSystem = createMissionSystem(context);
    return true;
  };

  const wake = () => tryInstall();
  const disposers = [
    context.events.on('world:ready', wake),
    context.events.on('battlefield:ready', wake),
    context.events.on('extension:installed', wake),
  ];
  tryInstall();

  return {
    name,
    update(delta) {
      if (!missionSystem) tryInstall();
      missionSystem?.update?.(delta);
    },
    dispose() {
      disposed = true;
      for (const dispose of disposers.splice(0).reverse()) dispose?.();
      missionSystem?.dispose?.();
      missionSystem = null;
    },
  };
}

function createMissionSystem(context) {
  const { app, events, input, player, scene } = context;
  const world = app.world;
  const battlefield = app.battlefield;
  const simulation = app.battlefieldSimulation ?? battlefield?.simulation;

  const mission = new MissionState();
  const landmarks = world.landmarks;
  const alliedSquad = simulation.squads.find(
    (squad) => squad.factionId === FactionId.VANGUARD,
  );
  const enemySquad = simulation.squads.find(
    (squad) => squad.factionId === FactionId.SAINT_ORENS,
  );
  const captain = enemySquad?.actors.find((actor) => actor.role === 'captain');
  const standardPosition = landmarks.meleeLane.clone().add(new Vector3(3, 0, 1));
  standardPosition.y = world.sampleHeight(standardPosition.x, standardPosition.z);
  const markerRoot = new Group();
  markerRoot.name = 'MissionMarkers';
  scene.add(markerRoot);

  const standardProp = createCarriedStandard();
  standardProp.position.copy(standardPosition);
  standardProp.rotation.z = Math.PI * 0.43;
  markerRoot.add(standardProp);

  const standardMarker = createMarker('FALLEN STANDARD', 0x91aec8);
  markerRoot.add(standardMarker.object3d);
  const rallyMarker = createMarker('RALLY THE HEDGE', 0xd0b66e);
  markerRoot.add(rallyMarker.object3d);
  const spearMarker = createMarker('BREAK THE SPEARS', 0xb75945);
  markerRoot.add(spearMarker.object3d);
  const captainMarker = createMarker('ENEMY CAPTAIN', 0xc9513d);
  markerRoot.add(captainMarker.object3d);
  const bridgeMarker = createMarker('RAISE THE STANDARD', 0xd8c47d);
  markerRoot.add(bridgeMarker.object3d);

  const disposers = [];
  let elapsed = 0;
  let statusTimer = 0;
  let started = false;
  let interactionVisible = false;
  let lastProgressBucket = -1;
  let lastCommand = null;
  let pendingDeath = false;

  stageSquad(alliedSquad, landmarks.hedgerowRally, new Vector3(0, 0, -1));
  stageSquad(enemySquad, landmarks.spearLine, new Vector3(0, 0, 1));
  if (captain?.combatant) {
    // The officer participates in the spear-line pressure but remains a
    // distinct climax target instead of being accidentally removed during
    // the preceding formation objective.
    captain.combatant.health = captain.combatant.maxHealth * 12;
  }
  alliedSquad?.issueOrder?.('hold');
  enemySquad?.issueOrder?.('hold');

  const setObjective = (stage, { phase, announcement } = {}) => {
    const objective = OBJECTIVES[stage];
    if (!objective) return;
    events.emit('objective:set', { objective: { ...objective, progress: 0 } });
    if (phase) events.emit('battle:phase', { phase });
    if (announcement) events.emit('announcement', announcement);
    lastProgressBucket = -1;
  };

  const beginMission = () => {
    if (started || mission.stage !== MissionStage.RECOVER) return;
    started = true;
    setObjective(MissionStage.RECOVER, { phase: 'skirmish' });
    events.emit('commands', { commands: [] });
    events.emit('tutorial', { cue: 'interact', duration: 7 });
    events.emit('battle:status', { phase: 'vanguard scattered' });
  };

  const completeAndAdvance = (transition) => {
    if (!transition) return;
    const completed = OBJECTIVES[transition.previous];
    if (completed) {
      events.emit('objective:complete', {
        id: completed.id,
        objective: { ...completed, progress: 1, state: 'complete' },
        advance: false,
      });
    }

    if (transition.current === MissionStage.RALLY) {
      standardProp.visible = false;
      attachStandardToPlayer(player, standardProp, markerRoot);
      battlefield.triggerReversal({
        id: 'standard-recovered',
        factionId: FactionId.VANGUARD,
        position: standardPosition,
        radius: 78,
        moraleShift: 0.28,
        enemyShock: 0.08,
        advanceTarget: landmarks.hedgerowRally,
      });
      setObjective(MissionStage.RALLY, {
        phase: 'rally',
        announcement: {
          title: 'THE STANDARD IS YOURS',
          detail: 'Carry it west to the hedgerow. Q rallies nearby survivors.',
          tone: 'mission',
        },
      });
      events.emit('commands', { commands: COMMANDS, active: 'rally' });
      events.emit('tutorial', {
        cue: { keys: ['Q', '1'], text: 'Rally nearby survivors at the hedgerow' },
        duration: 8,
      });
      events.emit('subtitle', {
        speaker: 'Gascon Sergeant',
        text: 'To the hedge! Give them a colour to stand beneath!',
      });
    } else if (transition.current === MissionStage.BREAK) {
      battlefield.triggerReversal({
        id: 'hedgerow-rallied',
        factionId: FactionId.VANGUARD,
        position: landmarks.hedgerowRally,
        radius: 130,
        moraleShift: 0.34,
        enemyShock: 0.16,
        advanceTarget: landmarks.spearLine,
      });
      setObjective(MissionStage.BREAK, {
        phase: 'spear_line',
        announcement: {
          title: 'THE HEDGE HOLDS',
          detail: 'Brace the retinue, then drive it into the spear line.',
          tone: 'assault',
        },
      });
      events.emit('commands', { commands: COMMANDS, active: 'brace' });
      events.emit('tutorial', {
        cue: { keys: ['R', 'F'], text: 'Brace, then advance into the wavering line' },
        duration: 8,
      });
    } else if (transition.current === MissionStage.CAPTAIN) {
      if (captain?.combatant) {
        if (!captain.combatant.alive) captain.combatant.reset();
        captain.combatant.health = captain.combatant.maxHealth;
      }
      battlefield.triggerReversal({
        id: 'spear-line-broken',
        factionId: FactionId.VANGUARD,
        position: landmarks.spearLine,
        radius: 180,
        moraleShift: 0.22,
        enemyShock: 0.32,
        advanceTarget: landmarks.bridge,
      });
      simulation.setDistantFormationState?.('orens-ford-ranks', 'fractured', { speed: -0.7 });
      if (captain?.combatant?.alive) {
        enemySquad?.issueOrder?.('advance', { target: landmarks.bridge });
      }
      setObjective(MissionStage.CAPTAIN, {
        phase: 'ford',
        announcement: {
          title: 'THE SPEAR LINE BREAKS',
          detail: 'Their captain is falling back toward the ford.',
          tone: 'climax',
        },
      });
      events.emit('commands', { commands: COMMANDS, active: 'advance' });
      events.emit('subtitle', {
        speaker: 'Gascon Sergeant',
        text: 'There—the captain under the red cloth! Bring him down!',
      });
    } else if (transition.current === MissionStage.VICTORY) {
      setObjective(MissionStage.VICTORY, {
        phase: 'victory',
        announcement: {
          title: 'THE CAPTAIN FALLS',
          detail: 'Take the bridge and raise the Ashen Standard.',
          tone: 'routed',
        },
      });
      events.emit('commands', { commands: [] });
    } else if (transition.current === MissionStage.WON) {
      battlefield.triggerReversal({
        id: 'bridge-secured',
        factionId: FactionId.VANGUARD,
        position: landmarks.bridge,
        radius: 260,
        moraleShift: 0.4,
        enemyShock: 0.45,
        advanceTarget: landmarks.enemyRise,
      });
      events.emit('commands', { commands: [] });
      events.emit('interaction', { visible: false });
      events.emit('victory', {
        stats: [
          { label: 'Enemies felled', value: mission.kills },
          { label: 'Commands given', value: (
            mission.rallyCommands + mission.braceCommands + mission.advanceCommands
          ) },
        ],
      });
      input.exitPointerLock();
      player.enabled = false;
    } else if (transition.current === MissionStage.DEAD) {
      events.emit('commands', { commands: [] });
      events.emit('interaction', { visible: false });
      events.emit('mission:fail', {
        failedObjective: transition.previous,
        stats: [{ label: 'Enemies felled', value: mission.kills }],
      });
      input.exitPointerLock();
      player.enabled = false;
    }
  };

  const api = Object.freeze({
    getState: () => mission.snapshot(),
    getCaptain: () => captain,
    restart: () => events.emit('mission:restart'),
    // Deterministic harness hooks for browser-level mission verification.
    // They invoke the same production transition and presentation paths as
    // player input; they do not mutate the state machine directly.
    verify: Object.freeze({
      recoverStandard: () => completeAndAdvance(mission.recoverStandard()),
      rally: () => {
        while (mission.stage === MissionStage.RALLY) {
          const transition = mission.command('rally', {
            nearRally: true,
            affected: 1,
          });
          if (transition) {
            completeAndAdvance(transition);
            break;
          }
        }
        return mission.snapshot();
      },
      breakLine: () => {
        if (mission.stage === MissionStage.BREAK) {
          completeAndAdvance(mission.command('brace', {
            nearSpearLine: true,
            affected: 1,
          }));
        }
        while (mission.stage === MissionStage.BREAK) {
          const transition = mission.command('advance', {
            nearSpearLine: true,
            affected: 1,
          });
          if (transition) {
            completeAndAdvance(transition);
            break;
          }
        }
        return mission.snapshot();
      },
      defeatCaptain: () => completeAndAdvance(mission.defeatCaptain()),
      secureBridge: () => completeAndAdvance(mission.secureBridge({
        nearBridge: true,
        interacted: true,
      })),
      die: () => completeAndAdvance(mission.die()),
    }),
  });
  app.gameplay = api;

  const handleKill = ({ target } = {}) => {
    const actor = target?.actor ?? target?.combatant?.actor;
    if (!actor || actor.factionId !== FactionId.SAINT_ORENS) return;
    const position = actor.object3d?.position ?? target?.position;
    completeAndAdvance(mission.recordKill({
      captain: actor === captain || actor.role === 'captain',
      nearRally: distance2D(position, landmarks.hedgerowRally) <= 34,
      nearSpearLine: distance2D(position, landmarks.spearLine) <= 58,
    }));
  };

  disposers.push(events.on('combat:kill', handleKill));
  disposers.push(events.on('player:death', () => {
    if (pendingDeath) return;
    pendingDeath = true;
    completeAndAdvance(mission.die());
  }));
  disposers.push(events.on('state:change', (state) => {
    if (state === 'playing') beginMission();
  }));
  disposers.push(events.on('mission:restart', () => {
    globalThis.location?.reload?.();
  }));

  const issueCommand = (command) => {
    if (mission.stage === MissionStage.DEAD || mission.stage === MissionStage.WON) return;
    const nearRally = distance2D(player.position, landmarks.hedgerowRally) <= 30;
    const nearSpearLine = distance2D(player.position, landmarks.spearLine) <= 62;
    let affected = [];

    if (command === 'rally') {
      affected = battlefield.rally({ radius: 46 });
      events.emit('subtitle', {
        speaker: 'Martin',
        text: affected.length ? 'On the standard! Close the line!' : 'No one is close enough to rally!',
        duration: 2.4,
      });
    } else if (command === 'brace') {
      affected = battlefield.brace({ radius: 170 });
      events.emit('subtitle', {
        speaker: 'Martin',
        text: affected.length ? 'Brace! Set yourselves!' : 'The retinue is out of earshot!',
        duration: 2.4,
      });
    } else if (command === 'advance') {
      const target = mission.stage === MissionStage.CAPTAIN && captain?.combatant?.alive
        ? captain
        : null;
      affected = target
        ? battlefield.focus(target, { radius: 170 })
        : battlefield.advance(
          mission.stage === MissionStage.VICTORY ? landmarks.bridge : landmarks.spearLine,
          { radius: 170 },
        );
      events.emit('subtitle', {
        speaker: 'Martin',
        text: affected.length
          ? target ? 'Their captain! Take him!' : 'Forward with me!'
          : 'The retinue is too far away!',
        duration: 2.4,
      });
    }

    lastCommand = command;
    events.emit('commands', { commands: COMMANDS, active: command });
    events.emit('command:issued', { command, affected });
    completeAndAdvance(mission.command(command, {
      nearRally,
      nearSpearLine,
      affected: affected.length,
    }));
  };

  const updateMarkers = (delta) => {
    elapsed += delta;
    const bob = Math.sin(elapsed * 2.2) * 0.18;
    const stage = mission.stage;
    const active = {
      standard: stage === MissionStage.RECOVER,
      rally: stage === MissionStage.RALLY,
      spear: stage === MissionStage.BREAK,
      captain: stage === MissionStage.CAPTAIN && captain?.combatant?.alive,
      bridge: stage === MissionStage.VICTORY,
    };
    standardMarker.update(standardPosition, active.standard, bob);
    rallyMarker.update(landmarks.hedgerowRally, active.rally, bob);
    spearMarker.update(landmarks.spearLine, active.spear, bob);
    captainMarker.update(captain?.object3d?.position, active.captain, bob);
    bridgeMarker.update(landmarks.bridge, active.bridge, bob);

    if (mission.standardRecovered && player.enabled) {
      standardProp.visible = true;
      standardProp.position.set(
        player.position.x - Math.cos(player.yaw) * 0.45,
        player.position.y + 1.18,
        player.position.z + Math.sin(player.yaw) * 0.45,
      );
      standardProp.rotation.set(0, player.yaw, -0.08);
    }
  };

  const updateInteraction = () => {
    let interaction = null;
    if (
      mission.stage === MissionStage.RECOVER
      && distance2D(player.position, standardPosition) <= 3.4
    ) {
      interaction = { key: 'E', label: 'Recover the Ashen Standard' };
    } else if (
      mission.stage === MissionStage.VICTORY
      && distance2D(player.position, landmarks.bridge) <= 8
    ) {
      interaction = { key: 'E', label: 'Raise the standard over the bridge' };
    }

    const visible = Boolean(interaction);
    if (visible !== interactionVisible || visible) {
      events.emit('interaction', interaction ?? { visible: false });
      interactionVisible = visible;
    }
    return interaction;
  };

  const emitProgress = (battleState) => {
    const progress = mission.progress;
    const bucket = Math.floor(progress * 20);
    if (bucket === lastProgressBucket) return;
    lastProgressBucket = bucket;

    let detail = OBJECTIVES[mission.stage]?.detail;
    if (mission.stage === MissionStage.RALLY) {
      detail = mission.rallyProgress > 0
        ? `The survivors are answering: ${Math.min(mission.rallyProgress, mission.config.rallyRequired)}/${mission.config.rallyRequired} rally efforts.`
        : 'Reach the hedgerow and use Q while survivors are nearby.';
    } else if (mission.stage === MissionStage.BREAK) {
      const enemy = battleState?.factions?.get?.(FactionId.SAINT_ORENS);
      detail = `Coordinate brace and advance; enemy morale ${Math.round((enemy?.morale ?? 1) * 100)}%.`;
    }
    events.emit('objective:progress', { progress, detail });
  };

  return {
    name,
    update(delta) {
      if (!started && context.state.isPlaying) beginMission();
      if (!started || mission.stage === MissionStage.DEAD || mission.stage === MissionStage.WON) {
        updateMarkers(delta);
        return;
      }

      updateMarkers(delta);
      const interaction = updateInteraction();

      if (input.wasPressed('interact') && interaction) {
        if (mission.stage === MissionStage.RECOVER) {
          completeAndAdvance(mission.recoverStandard());
        } else if (mission.stage === MissionStage.VICTORY) {
          completeAndAdvance(mission.secureBridge({
            nearBridge: true,
            interacted: true,
          }));
        }
      }
      if (input.wasPressed('commandRally')) issueCommand('rally');
      if (input.wasPressed('commandBrace')) issueCommand('brace');
      if (input.wasPressed('commandAdvance')) issueCommand('advance');

      statusTimer -= delta;
      if (statusTimer <= 0) {
        const battleState = battlefield.getState();
        const allied = battleState?.factions?.get?.(FactionId.VANGUARD);
        const enemy = battleState?.factions?.get?.(FactionId.SAINT_ORENS);
        const enemySnapshot = battleState?.squads?.find?.(
          (squad) => squad.factionId === FactionId.SAINT_ORENS,
        );
        completeAndAdvance(mission.update({
          delta: 0.25,
          nearRally: distance2D(player.position, landmarks.hedgerowRally) <= 28,
          alliedMorale: allied?.morale ?? 0,
          alliedAlive: allied?.alive ?? 0,
          enemyMorale: enemy?.morale ?? 1,
          enemyAlive: enemy?.alive ?? Infinity,
          enemyRouted: enemySnapshot?.cohesion?.state === 'routed',
          captainAlive: captain?.combatant?.alive ?? false,
        }));
        emitProgress(battleState);
        events.emit('battle:status', {
          phase: mission.stage === MissionStage.RECOVER
            ? 'vanguard scattered'
            : mission.stage === MissionStage.RALLY
              ? 'standard recovered'
              : mission.stage === MissionStage.BREAK
                ? 'counterattack'
                : mission.stage === MissionStage.CAPTAIN
                  ? 'enemy line broken'
                  : 'bridge contested',
          allied: {
            cohesion: allied?.morale ?? 0,
            state: battleState?.squads?.find?.(
              (squad) => squad.factionId === FactionId.VANGUARD,
            )?.cohesion?.state,
          },
          enemy: {
            cohesion: enemy?.morale ?? 0,
            state: enemySnapshot?.cohesion?.state,
          },
        });
        statusTimer = 0.25;
      }

      if (lastCommand && mission.stage === MissionStage.CAPTAIN && captain?.combatant?.alive) {
        // Keep a focus order useful as the captain falls back rather than
        // requiring the player to repeatedly refresh it.
        if (lastCommand === 'advance' && Math.floor(elapsed) % 5 === 0) {
          alliedSquad?.issueOrder?.('focus', { focusTarget: captain });
        }
      }
    },
    dispose() {
      player.enabled = true;
      if (app.gameplay === api) delete app.gameplay;
      events.emit('interaction', { visible: false });
      events.emit('commands', { commands: [] });
      for (const dispose of disposers.splice(0).reverse()) dispose?.();
      markerRoot.removeFromParent();
      disposeGroup(markerRoot);
    },
  };
}

function createMarker(label, color) {
  const object3d = new Group();
  const ring = new Mesh(
    new CylinderGeometry(0.82, 0.82, 0.045, 28, 1, true),
    new MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.68,
      depthWrite: false,
    }),
  );
  ring.position.y = 0.08;
  object3d.add(ring);

  const sprite = new Sprite(new SpriteMaterial({
    map: createLabelTexture(label, color),
    transparent: true,
    depthTest: false,
    depthWrite: false,
  }));
  sprite.scale.set(5.4, 1.05, 1);
  sprite.renderOrder = 40;
  object3d.add(sprite);

  return {
    object3d,
    update(position, visible, bob = 0) {
      object3d.visible = Boolean(visible && position);
      if (!object3d.visible) return;
      object3d.position.copy(position);
      ring.rotation.y += 0.012;
      sprite.position.y = 3.2 + bob;
    },
  };
}

function createLabelTexture(label, color) {
  if (!globalThis.document?.createElement) return null;
  const canvas = globalThis.document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(12, 11, 9, 0.76)';
  ctx.fillRect(8, 10, 496, 76);
  ctx.strokeStyle = `#${color.toString(16).padStart(6, '0')}`;
  ctx.lineWidth = 3;
  ctx.strokeRect(8, 10, 496, 76);
  ctx.fillStyle = '#f0e7cd';
  ctx.font = '600 27px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 256, 50);
  const texture = new CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function createCarriedStandard() {
  const group = new Group();
  group.name = 'GameplayAshenStandard';
  const wood = new MeshStandardMaterial({ color: 0x4b3421, roughness: 0.92 });
  const cloth = new MeshStandardMaterial({
    color: 0x29445d,
    roughness: 0.9,
    side: DoubleSide,
  });
  const pole = new Mesh(new CylinderGeometry(0.035, 0.045, 3.4, 8), wood);
  pole.position.y = 1.7;
  const banner = new Mesh(new PlaneGeometry(1.35, 0.86, 5, 3), cloth);
  banner.position.set(-0.7, 2.72, 0);
  const cross = new Mesh(
    new BoxGeometry(0.8, 0.04, 0.04),
    new MeshStandardMaterial({ color: 0x6b6455, metalness: 0.35, roughness: 0.55 }),
  );
  cross.position.y = 3.15;
  group.add(pole, banner, cross);
  group.traverse((object) => {
    if (object.isMesh) object.castShadow = true;
  });
  return group;
}

function attachStandardToPlayer(_player, standard, markerRoot) {
  if (standard.parent !== markerRoot) markerRoot.add(standard);
  standard.visible = true;
}

function stageSquad(squad, landmark, forward) {
  if (!squad || !landmark) return;
  squad.anchor.copy(landmark);
  squad.orderTarget.copy(landmark);
  squad.forward.copy(forward).setY(0).normalize();
  squad.retreatPoint.copy(landmark).addScaledVector(forward, -70);
  const alive = squad.actors.filter((actor) => actor.combatant.alive);
  alive.forEach((actor, index) => {
    squad.formation.worldSlot(
      index,
      alive.length,
      squad.morale.state,
      squad.anchor,
      squad.forward,
      actor.object3d.position,
    );
    actor.object3d.position.y = landmark.y;
    actor.setHeading(Math.atan2(forward.x, forward.z));
  });
}

function distance2D(a, b) {
  if (!a || !b) return Infinity;
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function disposeGroup(root) {
  root.traverse((object) => {
    object.geometry?.dispose?.();
    if (Array.isArray(object.material)) {
      object.material.forEach((material) => {
        material.map?.dispose?.();
        material.dispose?.();
      });
    } else {
      object.material?.map?.dispose?.();
      object.material?.dispose?.();
    }
  });
}

export default { name, install };
