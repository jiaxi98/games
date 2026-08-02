import { CAMPAIGN, getMissionObjective, getNextMissionObjective } from './campaign.js';
import {
  BattlePhase,
  createBattlePhaseEvent,
} from './battlePhases.js';

const DEFAULT_TIMINGS = Object.freeze({
  subtitle: 5.5,
  announcement: 2.75,
  objective: 4.75,
  barkCooldown: 3,
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function createSeededRandom(seed = 1356) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function normaliseObjective(input) {
  if (typeof input === 'string') {
    return getMissionObjective(input) ?? {
      id: input,
      title: input,
      detail: '',
      short: input,
    };
  }
  if (!input || typeof input !== 'object') return null;
  return {
    id: input.id ?? input.title ?? 'objective',
    title: input.title ?? input.short ?? '',
    detail: input.detail ?? '',
    short: input.short ?? input.title ?? '',
  };
}

/**
 * A small event-driven mission/narrative state machine.
 *
 * Events emitted:
 * - `mission:start`, `mission:complete`, `mission:fail`
 * - `objective:set`, `objective:complete`, `objective:progress`
 * - `subtitle`, `announcement`, `battle:phase`
 *
 * Subscribe through `on(type, callback)` or pass events directly to a HUD with
 * `connectHUD(hud)`.
 */
export function createNarrativeDirector(options = {}) {
  const campaign = options.campaign ?? CAMPAIGN;
  const timings = { ...DEFAULT_TIMINGS, ...(options.timings ?? {}) };
  const listeners = new Map();
  const random = createSeededRandom(options.seed ?? 1356);
  const queue = [];
  const completed = new Set();
  let currentObjective = null;
  let missionState = 'idle';
  let phase = 'idle';
  let elapsed = 0;
  let barkCooldown = 0;
  let disposed = false;
  let hudDisconnect = null;

  const emit = (type, detail = {}) => {
    if (disposed) return;
    const event = { type, time: elapsed, ...detail };
    listeners.get(type)?.forEach((listener) => listener(event));
    listeners.get('*')?.forEach((listener) => listener(event));
  };

  const on = (type, listener) => {
    if (typeof listener !== 'function') return () => {};
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(listener);
    return () => listeners.get(type)?.delete(listener);
  };

  const schedule = (delay, type, detail) => {
    queue.push({
      at: elapsed + Math.max(0, Number(delay) || 0),
      type,
      detail,
    });
    queue.sort((a, b) => a.at - b.at);
  };

  const setObjective = (objective, objectiveOptions = {}) => {
    const normalised = normaliseObjective(objective);
    if (!normalised) return null;
    currentObjective = {
      ...normalised,
      progress: clamp(objectiveOptions.progress ?? 0, 0, 1),
      state: 'active',
    };
    emit('objective:set', {
      objective: { ...currentObjective },
      duration: objectiveOptions.duration ?? timings.objective,
    });
    return { ...currentObjective };
  };

  const completeObjective = (id = currentObjective?.id, completionOptions = {}) => {
    if (!id || completed.has(id)) return false;
    const objective =
      (currentObjective?.id === id && currentObjective) ||
      normaliseObjective(getMissionObjective(id)) ||
      normaliseObjective(id);
    completed.add(id);
    if (currentObjective?.id === id) {
      currentObjective = { ...currentObjective, progress: 1, state: 'complete' };
    }
    emit('objective:complete', { objective: { ...objective, progress: 1 } });

    const next = completionOptions.next
      ? normaliseObjective(completionOptions.next)
      : getNextMissionObjective(id);
    if (next && completionOptions.advance !== false) {
      schedule(completionOptions.delay ?? 1.4, 'director:set-objective', { objective: next });
    }
    return true;
  };

  const updateObjective = (progress, detail) => {
    if (!currentObjective || currentObjective.state !== 'active') return;
    currentObjective.progress = clamp(progress, 0, 1);
    if (detail) currentObjective.detail = detail;
    emit('objective:progress', { objective: { ...currentObjective } });
  };

  const announce = (title, detail = '', announcementOptions = {}) => {
    emit('announcement', {
      title,
      detail,
      tone: announcementOptions.tone ?? 'neutral',
      duration: announcementOptions.duration ?? timings.announcement,
    });
  };

  const subtitle = (speaker, text, subtitleOptions = {}) => {
    emit('subtitle', {
      speaker,
      text,
      tone: subtitleOptions.tone ?? 'normal',
      duration: subtitleOptions.duration ?? timings.subtitle,
    });
  };

  const startMission = (startOptions = {}) => {
    missionState = 'active';
    elapsed = 0;
    completed.clear();
    currentObjective = null;
    emit('mission:start', { campaign, mission: campaign.mission });
    if (startOptions.announce !== false) {
      announce(campaign.mission.title, campaign.mission.order, {
        tone: 'mission',
        duration: startOptions.announcementDuration ?? 3.2,
      });
    }
    if (startOptions.setObjective !== false) {
      schedule(startOptions.objectiveDelay ?? 1.7, 'director:set-objective', {
        objective: startOptions.objective ?? campaign.mission.objectives[0],
      });
    }
    if (startOptions.bark !== false) {
      schedule(startOptions.barkDelay ?? 5.6, 'subtitle', {
        speaker: 'Gascon Man-at-Arms',
        text: 'The standard is down! Get it clear of the press!',
        duration: timings.subtitle,
      });
    }
  };

  const setBattlePhase = (nextPhase, phaseOptions = {}) => {
    if (!nextPhase || nextPhase === phase) return;
    const phaseEvent = createBattlePhaseEvent(nextPhase, phaseOptions);
    phase = phaseEvent.phase;
    emit('battle:phase', phaseEvent);
    if (phaseOptions.announce === false) return;
    const copy = {
      [BattlePhase.OPENING]: ['THE CENTRE COLLAPSES', 'Reach the fallen standard.'],
      [BattlePhase.STANDARD]: ['THE STANDARD IS YOURS', 'Carry it to the western hedgerow.'],
      [BattlePhase.RALLY]: ['THE HEDGE MUST HOLD', 'Rally the survivors beneath the colours.'],
      [BattlePhase.SPEAR_LINE]: ['THE SPEARS ADVANCE', 'Brace, then drive the retinue into their line.'],
      [BattlePhase.FORD]: ['THE FORD IS OPEN', 'Their captain holds the bridge approach.'],
      [BattlePhase.VICTORY]: ['THEIR LINE BREAKS', 'Raise the Ashen Standard above the bridge.'],
    }[phase];
    if (copy) announce(copy[0], phaseOptions.detail ?? copy[1], { tone: phase });
  };

  const completeMission = (resultOptions = {}) => {
    if (missionState !== 'active') return;
    missionState = 'victory';
    emit('mission:complete', {
      campaign,
      ending: campaign.endings.victory,
      ...resultOptions,
    });
  };

  const failMission = (resultOptions = {}) => {
    if (missionState !== 'active') return;
    missionState = 'death';
    emit('mission:fail', {
      campaign,
      ending: campaign.endings.death,
      ...resultOptions,
    });
  };

  const contextualBark = (kind, barkOptions = {}) => {
    if (barkCooldown > 0 && !barkOptions.force) return false;
    const barks = {
      advance: [
        ['Gascon Sergeant', 'Forward! Keep close to the standard!'],
        ['Vanguard Spearman', 'With him—through the mud!'],
      ],
      hold: [
        ['Gascon Sergeant', 'Brace at the hedge. Let the spears come.'],
        ['Vanguard Spearman', 'Close the gap! Stand your ground!'],
      ],
      danger: [
        ['Gascon Archer', 'Crossbows beyond the mill!'],
        ['Gascon Sergeant', 'Watch your flank, man-at-arms!'],
      ],
      victory: [
        ['Vanguard Spearman', 'Their order is gone!'],
        ['Gascon Sergeant', 'One more push! Take the bridge!'],
      ],
    }[kind];
    if (!barks?.length) return false;
    const [speaker, text] = barks[Math.floor(random() * barks.length)];
    subtitle(speaker, text, barkOptions);
    barkCooldown = timings.barkCooldown;
    return true;
  };

  const update = (deltaSeconds) => {
    if (disposed) return;
    const delta = Math.max(0, Number(deltaSeconds) || 0);
    elapsed += delta;
    barkCooldown = Math.max(0, barkCooldown - delta);
    while (queue.length && queue[0].at <= elapsed) {
      const item = queue.shift();
      if (item.type === 'director:set-objective') {
        setObjective(item.detail.objective, item.detail);
      } else {
        emit(item.type, item.detail);
      }
    }
  };

  const handleEvent = (type, detail = {}) => {
    switch (type) {
      case 'mission:start':
      case 'start':
        startMission(detail);
        break;
      case 'objective:set':
        if (detail.authority === 'mission') {
          currentObjective = {
            ...normaliseObjective(detail.objective ?? detail),
            progress: clamp(detail.objective?.progress ?? detail.progress ?? 0, 0, 1),
            state: detail.objective?.state ?? 'active',
          };
          emit('objective:set', { ...detail, objective: { ...currentObjective } });
        } else setObjective(detail.objective ?? detail, detail);
        break;
      case 'objective:progress':
        if (detail.authority === 'mission') {
          if (currentObjective) {
            currentObjective.progress = clamp(detail.progress, 0, 1);
            if (detail.detail) currentObjective.detail = detail.detail;
          }
          emit('objective:progress', {
            ...detail,
            objective: currentObjective ? { ...currentObjective } : detail.objective,
          });
        } else updateObjective(detail.progress, detail.detail);
        break;
      case 'objective:complete':
        if (detail.authority === 'mission') {
          if (detail.id) completed.add(detail.id);
          if (currentObjective?.id === detail.id) {
            currentObjective = { ...currentObjective, progress: 1, state: 'complete' };
          }
          emit('objective:complete', {
            ...detail,
            objective: detail.objective ?? (currentObjective ? { ...currentObjective } : null),
          });
        } else completeObjective(detail.id, detail);
        break;
      case 'battle:phase':
        setBattlePhase(detail.phase, detail);
        break;
      case 'mission:complete':
      case 'victory':
        completeMission(detail);
        break;
      case 'mission:fail':
      case 'death':
        failMission(detail);
        break;
      case 'subtitle':
        subtitle(detail.speaker, detail.text, detail);
        break;
      case 'announcement':
        announce(detail.title, detail.detail, detail);
        break;
      default:
        emit(type, detail);
    }
  };

  const connectHUD = (hud) => {
    hudDisconnect?.();
    if (!hud?.handleEvent) return () => {};
    const disconnect = on('*', (event) => hud.handleEvent(event.type, event));
    hudDisconnect = disconnect;
    return disconnect;
  };

  const getState = () => ({
    campaign,
    missionState,
    phase,
    elapsed,
    objective: currentObjective ? { ...currentObjective } : null,
    completed: [...completed],
  });

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    hudDisconnect?.();
    listeners.clear();
    queue.length = 0;
  };

  return {
    campaign,
    startMission,
    setObjective,
    updateObjective,
    completeObjective,
    setBattlePhase,
    completeMission,
    failMission,
    announce,
    subtitle,
    contextualBark,
    handleEvent,
    connectHUD,
    on,
    update,
    getState,
    dispose,
  };
}
