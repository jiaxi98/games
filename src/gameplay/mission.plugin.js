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
import {
  BattlePhase,
  createBattlePhaseEvent,
} from '../narrative/battlePhases.js';
import { CAMPAIGN } from '../narrative/campaign.js';
import { MissionStage, MissionState } from './MissionState.js';
import { createRouteEncounterDirector } from './RouteEncounterDirector.js';

export const name = 'ashen-standard-mission';

const COMMANDS = Object.freeze([
  { id: 'rally', key: 'Q / 1', label: 'Rally' },
  { id: 'brace', key: 'R / 2', label: 'Brace' },
  { id: 'advance', key: 'F / 3', label: 'Advance' },
]);

const COMMANDS_BY_STAGE = Object.freeze({
  [MissionStage.RALLY]: Object.freeze([COMMANDS[0]]),
  [MissionStage.BREAK]: Object.freeze([COMMANDS[1], COMMANDS[2]]),
  [MissionStage.CAPTAIN]: Object.freeze([
    { ...COMMANDS[2], label: 'Focus captain' },
  ]),
});

const PHASE_BY_STAGE = Object.freeze({
  [MissionStage.RECOVER]: BattlePhase.OPENING,
  [MissionStage.RALLY]: BattlePhase.RALLY,
  [MissionStage.BREAK]: BattlePhase.SPEAR_LINE,
  [MissionStage.CAPTAIN]: BattlePhase.FORD,
  [MissionStage.VICTORY]: BattlePhase.VICTORY,
});

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
  const routeEncounters = createRouteEncounterDirector({
    simulation,
    landmarks,
    player,
    events,
  });
  const alliedSquad = routeEncounters.squads.ALLIED_RETINUE;
  const enemySquad = routeEncounters.squads.SPEAR_LINE;
  const captain = routeEncounters.captain;
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
  let lastFocusRefreshAt = -Infinity;
  let captainHUDVisible = false;
  let captainPhase = null;
  const combatStats = {
    damageTaken: 0,
    blocks: 0,
    parries: 0,
    guardBreaks: 0,
    evades: 0,
    secondWindUsed: false,
    captainStartedAt: null,
    captainDuration: 0,
  };

  const setObjective = (stage, { phase, announcement } = {}) => {
    const objective = OBJECTIVES[stage];
    if (!objective) return;
    events.emit('objective:set', {
      authority: 'mission',
      objective: { ...objective, progress: 0 },
    });
    if (phase) events.emit('battle:phase', createBattlePhaseEvent(phase));
    if (announcement) events.emit('announcement', announcement);
    lastProgressBucket = -1;
  };

  const emitCommands = (stage, active = null) => {
    events.emit('commands', {
      commands: COMMANDS_BY_STAGE[stage] ?? [],
      active,
    });
  };

  const beginMission = () => {
    if (started || mission.stage !== MissionStage.RECOVER) return;
    started = true;
    setObjective(MissionStage.RECOVER, { phase: PHASE_BY_STAGE[MissionStage.RECOVER] });
    emitCommands(MissionStage.RECOVER);
    events.emit('battle:status', createBattlePhaseEvent(BattlePhase.OPENING));
    events.emit('subtitle', {
      speaker: 'Gascon Sergeant',
      text: 'The standard is down. Follow the lane and bring it clear!',
      duration: 3.2,
    });
  };

  const completeAndAdvance = (transition) => {
    if (!transition) return;
    events.emit('tutorial', { visible: false, clear: true });
    const completed = OBJECTIVES[transition.previous];
    if (completed) {
      events.emit('objective:complete', {
        authority: 'mission',
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
        phase: PHASE_BY_STAGE[MissionStage.RALLY],
        announcement: {
          title: 'THE STANDARD IS YOURS',
          detail: 'Carry it west to the hedgerow. Q rallies nearby survivors.',
          tone: 'mission',
          duration: 2.7,
        },
      });
      emitCommands(MissionStage.RALLY, 'rally');
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
        phase: PHASE_BY_STAGE[MissionStage.BREAK],
        announcement: {
          title: 'THE HEDGE HOLDS',
          detail: 'Brace the retinue, then drive it into the spear line.',
          tone: 'assault',
          duration: 2.7,
        },
      });
      emitCommands(MissionStage.BREAK, 'brace');
      events.emit('tutorial', {
        cue: { keys: ['R', 'F'], text: 'Brace, then advance into the wavering line' },
        duration: 8,
      });
    } else if (transition.current === MissionStage.CAPTAIN) {
      combatStats.captainStartedAt = elapsed;
      if (captain?.combatant) {
        if (!captain.combatant.alive) captain.combatant.reset();
        captain.combatant.health = captain.combatant.maxHealth;
        captain.combatant.targetable = false;
      }
      battlefield.triggerReversal({
        id: 'spear-line-broken',
        factionId: FactionId.VANGUARD,
        position: landmarks.spearLine,
        radius: 180,
        moraleShift: 0.22,
        enemyShock: 0.32,
        advanceTarget: landmarks.duelPoint ?? landmarks.bridge,
      });
      simulation.setDistantFormationState?.('orens-ford-ranks', 'fractured', { speed: -0.7 });
      setObjective(MissionStage.CAPTAIN, {
        phase: PHASE_BY_STAGE[MissionStage.CAPTAIN],
        announcement: {
          title: 'THE SPEAR LINE BREAKS',
          detail: 'Their captain is falling back toward the ford.',
          tone: 'climax',
          duration: 2.7,
        },
      });
      emitCommands(MissionStage.CAPTAIN, 'advance');
      updateCaptainHUD(true);
      events.emit('subtitle', {
        speaker: 'Gascon Sergeant',
        text: 'His guard is falling back to the bridge. Break the perimeter!',
      });
    } else if (transition.current === MissionStage.VICTORY) {
      if (combatStats.captainStartedAt !== null) {
        combatStats.captainDuration = Math.max(0, elapsed - combatStats.captainStartedAt);
      }
      setObjective(MissionStage.VICTORY, {
        phase: PHASE_BY_STAGE[MissionStage.VICTORY],
        announcement: {
          title: 'THE CAPTAIN FALLS',
          detail: 'Take the bridge and raise the Ashen Standard.',
          tone: 'routed',
          duration: 2.7,
        },
      });
      emitCommands(MissionStage.VICTORY);
      updateCaptainHUD(false);
      if (mission.kills === 0) {
        mission.kills = 1;
      }
    } else if (transition.current === MissionStage.WON) {
      plantStandardAtRaiseLandmark(standardProp, landmarks);
      battlefield.triggerReversal({
        id: 'bridge-secured',
        factionId: FactionId.VANGUARD,
        position: landmarks.standardRaise ?? landmarks.bridge,
        radius: 260,
        moraleShift: 0.4,
        enemyShock: 0.45,
        advanceTarget: landmarks.enemyRise,
      });
      emitCommands(MissionStage.WON);
      events.emit('interaction', { visible: false });
      events.emit('reticle', { state: 'hidden' });
      events.emit('victory', {
        stats: [
          { label: 'Enemies felled', value: mission.kills },
          { label: 'Captain duel', value: `${combatStats.captainDuration.toFixed(1)}s` },
          { label: 'Defences', value: combatStats.blocks + combatStats.parries },
          { label: 'Damage taken', value: Math.round(combatStats.damageTaken) },
          { label: 'Second wind', value: combatStats.secondWindUsed ? 'Used' : 'Not used' },
        ],
      });
      input.exitPointerLock();
      player.enabled = false;
    } else if (transition.current === MissionStage.DEAD) {
      emitCommands(MissionStage.DEAD);
      events.emit('interaction', { visible: false });
      events.emit('reticle', { state: 'hidden' });
      updateCaptainHUD(false);
      events.emit('mission:fail', {
        failedObjective: transition.previous,
        ending: CAMPAIGN.endings.failureByStage?.[transition.previous],
        stats: [{ label: 'Enemies felled', value: mission.kills }],
      });
      input.exitPointerLock();
      player.enabled = false;
    }
  };

  const api = Object.freeze({
    getState: () => mission.snapshot(),
    getCaptain: () => captain,
    getDebugState: () => ({
      standardPosition: standardPosition.clone(),
      landmarks,
      alliedSquad,
      enemySquad,
      captain,
      encounters: routeEncounters.director.snapshot(),
      combatStats: { ...combatStats },
    }),
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
    events.emit('battlefield:casualty', {
      factionId: actor.factionId,
      officer: actor === captain || actor.role === 'captain',
      position,
    });
    completeAndAdvance(mission.recordKill({
      captain: actor === captain || actor.role === 'captain',
      nearRally: distance2D(position, landmarks.hedgerowRally) <= 34,
      nearSpearLine: distance2D(position, landmarks.spearLine) <= 58,
    }));
  };

  disposers.push(events.on('combat:kill', handleKill));
  disposers.push(events.on('player:damage', ({ amount = 0, outcome } = {}) => {
    if (!['blocked', 'parried', 'avoided'].includes(outcome)) {
      combatStats.damageTaken += Math.max(0, Number(amount) || 0);
    }
  }));
  disposers.push(events.on('player:defense', ({ outcome } = {}) => {
    if (outcome === 'parried') combatStats.parries += 1;
    else if (outcome === 'blocked') combatStats.blocks += 1;
    else if (outcome === 'guard-broken') combatStats.guardBreaks += 1;
  }));
  disposers.push(events.on('player:evade', ({ phase } = {}) => {
    if (phase === 'complete') combatStats.evades += 1;
  }));
  disposers.push(events.on('player:second-wind', () => {
    combatStats.secondWindUsed = true;
  }));
  disposers.push(events.on('battlefield:stage-activated', ({ id } = {}) => {
    if (id !== 'captain-encounter') return;
    events.emit('tutorial', {
      cue: { keys: ['RMB', 'ALT'], text: 'Guard as his weapon commits. Backstep to make space.' },
      duration: 4.2,
    });
  }));
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
    const stageCommands = COMMANDS_BY_STAGE[mission.stage] ?? [];
    if (!stageCommands.some(({ id }) => id === command)) return;
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
      const target = (
        mission.stage === MissionStage.CAPTAIN
        && routeEncounters.director.captainEncounter?.active
        && captain?.combatant?.alive
      )
        ? captain
        : null;
      affected = target
        ? (
          // Keep the authored duel readable: allied units contain the bridge
          // perimeter instead of collapsing onto the captain's exact point.
          battlefield.advance(
            flankContainmentPoint(landmarks),
            { radius: 170 },
          )
        )
        : battlefield.advance(
          mission.stage === MissionStage.CAPTAIN || mission.stage === MissionStage.VICTORY
            ? landmarks.duelPoint ?? landmarks.bridge
            : landmarks.spearLine,
          { radius: 170 },
        );
      events.emit('subtitle', {
        speaker: 'Martin',
        text: affected.length
          ? target
            ? 'Their captain! Take him!'
            : mission.stage === MissionStage.CAPTAIN
              ? 'Drive through the bridge guard!'
              : 'Forward with me!'
          : 'The retinue is too far away!',
        duration: 2.4,
      });
    }

    lastCommand = command;
    emitCommands(mission.stage, command);
    events.emit('command:issued', {
      command,
      affected,
      position: player.position,
      success: affected.length > 0,
    });
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
      captain: (
        stage === MissionStage.CAPTAIN
        && routeEncounters.director.captainEncounter?.active
        && captain?.combatant?.alive
      ),
      bridge: stage === MissionStage.VICTORY,
    };
    standardMarker.update(standardPosition, active.standard, bob, player.position);
    rallyMarker.update(landmarks.hedgerowRally, active.rally, bob, player.position);
    spearMarker.update(landmarks.spearLine, active.spear, bob, player.position);
    captainMarker.update(
      captain?.object3d?.position,
      active.captain,
      bob,
      player.position,
      { compact: true },
    );
    bridgeMarker.update(
      landmarks.standardRaise ?? landmarks.bridge,
      active.bridge,
      bob,
      player.position,
    );

    if (
      mission.standardRecovered
      && player.enabled
      && mission.stage !== MissionStage.VICTORY
      && mission.stage !== MissionStage.WON
    ) {
      standardProp.visible = true;
      standardProp.position.set(
        player.position.x - Math.cos(player.yaw) * 0.45,
        player.position.y + 1.18,
        player.position.z + Math.sin(player.yaw) * 0.45,
      );
      standardProp.rotation.set(0, player.yaw, -0.08);
    }
  };

  const interactionInView = (position, maxDistance, minAlignment = 0.7) => {
    if (!position || distance2D(player.position, position) > maxDistance) return false;
    _interactionDirection.copy(position).sub(context.camera.position);
    if (_interactionDirection.lengthSq() < 0.0001) return true;
    _interactionDirection.normalize();
    context.camera.getWorldDirection(_cameraForward);
    return _cameraForward.dot(_interactionDirection) >= minAlignment;
  };

  const updateInteraction = () => {
    let interaction = null;
    if (
      mission.stage === MissionStage.RECOVER
      && interactionInView(standardPosition, 3.4, 0.66)
    ) {
      interaction = { key: 'E', label: 'Recover the Ashen Standard' };
    } else if (
      mission.stage === MissionStage.VICTORY
      && interactionInView(landmarks.standardRaise ?? landmarks.bridge, 8, 0.5)
    ) {
      interaction = { key: 'E', label: 'Raise the standard over the bridge' };
    }

    const visible = Boolean(interaction);
    if (visible !== interactionVisible || visible) {
      events.emit('interaction', interaction ?? { visible: false });
      events.emit('reticle', { state: visible ? 'interact' : 'default' });
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
      if (progress >= 0.75) detail = 'The hedgerow is closing ranks beneath the standard.';
      else if (progress >= 0.35) detail = 'More survivors are answering the rally.';
      else detail = 'Reach the hedgerow and rally survivors within earshot.';
    } else if (mission.stage === MissionStage.BREAK) {
      const enemy = battleState?.factions?.get?.(FactionId.SAINT_ORENS);
      const morale = enemy?.morale ?? 1;
      detail = morale <= 0.34
        ? 'The spear line is close to breaking—press the advance.'
        : morale <= 0.58
          ? 'Their formation is wavering. Keep the retinue together.'
          : 'Brace for contact, then order the retinue forward.';
    } else if (mission.stage === MissionStage.CAPTAIN) {
      detail = routeEncounters.director.captainEncounter?.active
        ? 'Keep the captain in sight and focus the retinue on him.'
        : 'Drive through the bridge guard and force the captain to commit.';
    }
    events.emit('objective:progress', { authority: 'mission', progress, detail });
  };

  function updateCaptainHUD(force = false) {
    const active = (
      mission.stage === MissionStage.CAPTAIN
      && routeEncounters.director.captainEncounter?.active
      && Boolean(captain?.combatant?.alive)
    );
    if (!active) {
      if (captainHUDVisible || force) {
        events.emit('encounter:captain', { visible: false });
      }
      captainHUDVisible = false;
      captainPhase = null;
      return;
    }
    const health = captain.combatant.health;
    const maxHealth = captain.combatant.maxHealth;
    const phase = routeEncounters.director.getCaptainPhase() ?? 'commanding';
    if (force || !captainHUDVisible || phase !== captainPhase) {
      events.emit('encounter:captain', {
        visible: true,
        name: 'Captain of Saint-Orens',
        health,
        maxHealth,
        phase,
      });
    } else {
      events.emit('encounter:captain', { visible: true, health, maxHealth, phase });
    }
    captainHUDVisible = true;
    captainPhase = phase;
  }

  return {
    name,
    update(delta) {
      if (!started && context.state.isPlaying) beginMission();
      if (!started || mission.stage === MissionStage.DEAD || mission.stage === MissionStage.WON) {
        updateMarkers(delta);
        return;
      }

      routeEncounters.director.update(delta, {
        stage: mission.stage,
        playerPosition: player.position,
      });
      updateMarkers(delta);
      const interaction = updateInteraction();
      updateCaptainHUD();

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
        const alliedSnapshot = battleState?.squads?.find?.(
          (squad) => squad.id === alliedSquad?.id,
        ) ?? alliedSquad?.snapshot?.();
        const enemySnapshot = battleState?.squads?.find?.(
          (squad) => squad.id === enemySquad?.id,
        ) ?? enemySquad?.snapshot?.();
        completeAndAdvance(mission.update({
          delta: 0.25,
          nearRally: distance2D(player.position, landmarks.hedgerowRally) <= 28,
          alliedMorale: alliedSnapshot?.cohesion?.value ?? allied?.morale ?? 0,
          alliedAlive: alliedSnapshot?.alive ?? allied?.alive ?? 0,
          enemyMorale: enemySnapshot?.cohesion?.value ?? enemy?.morale ?? 1,
          enemyAlive: enemySnapshot?.alive ?? enemy?.alive ?? Infinity,
          enemyRouted: enemySnapshot?.cohesion?.state === 'routed',
          captainAlive: captain?.combatant?.alive ?? false,
        }));
        emitProgress(battleState);
        events.emit('battle:status', {
          ...createBattlePhaseEvent(PHASE_BY_STAGE[mission.stage] ?? BattlePhase.OPENING),
          allied: {
            cohesion: allied?.morale ?? 0,
            state: alliedSnapshot?.cohesion?.state,
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
        if (lastCommand === 'advance' && elapsed - lastFocusRefreshAt >= 5) {
          alliedSquad?.issueOrder?.('hold', {
            target: flankContainmentPoint(landmarks),
          });
          lastFocusRefreshAt = elapsed;
        }
      }
    },
    dispose() {
      player.enabled = true;
      if (app.gameplay === api) delete app.gameplay;
      events.emit('interaction', { visible: false });
      events.emit('reticle', { state: 'hidden' });
      events.emit('encounter:captain', { visible: false });
      emitCommands(null);
      for (const dispose of disposers.splice(0).reverse()) dispose?.();
      markerRoot.removeFromParent();
      disposeGroup(markerRoot);
      routeEncounters.dispose();
    },
  };
}

function createMarker(label, color) {
  const object3d = new Group();
  const ringMaterial = new MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.68,
    depthTest: true,
    depthWrite: false,
  });
  const ring = new Mesh(
    new CylinderGeometry(0.82, 0.82, 0.045, 28, 1, true),
    ringMaterial,
  );
  ring.position.y = 0.08;
  object3d.add(ring);

  const spriteMaterial = new SpriteMaterial({
    map: createLabelTexture(label, color),
    transparent: true,
    depthTest: true,
    depthWrite: false,
  });
  const sprite = new Sprite(spriteMaterial);
  sprite.scale.set(5.4, 1.05, 1);
  object3d.add(sprite);

  return {
    object3d,
    update(position, visible, bob = 0, viewerPosition = null, options = {}) {
      object3d.visible = Boolean(visible && position);
      if (!object3d.visible) return;
      object3d.position.copy(position);
      ring.rotation.y += 0.012;
      sprite.position.y = 3.2 + bob;
      const distance = distance2D(position, viewerPosition);
      const distanceScale = Math.max(0.72, Math.min(1.28, 0.72 + distance / 120));
      const compactScale = options.compact ? 0.42 : 1;
      sprite.scale.set(
        5.4 * distanceScale * compactScale,
        1.05 * distanceScale * compactScale,
        1,
      );
      spriteMaterial.opacity = distance > 145 ? 0.42 : distance > 85 ? 0.62 : 0.9;
      ringMaterial.opacity = distance > 95 ? 0.3 : 0.68;
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

function distance2D(a, b) {
  if (!a || !b) return Infinity;
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function flankContainmentPoint(landmarks) {
  const duelPoint = landmarks.duelPoint ?? landmarks.bridge;
  return duelPoint.clone().add(new Vector3(-9, 0, 6));
}

function plantStandardAtRaiseLandmark(standard, landmarks) {
  const socket = landmarks.standardRaise ?? landmarks.bridge;
  standard.visible = true;
  standard.position.copy(socket);
  standard.rotation.set(0, 0, 0);
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

const _cameraForward = new Vector3();
const _interactionDirection = new Vector3();

export default { name, install };
