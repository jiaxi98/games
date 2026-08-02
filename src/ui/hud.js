import { CAMPAIGN } from '../narrative/campaign.js';
import { ensureUIStyles } from './styles.js';
import { createHUDTemplate, fillPanel } from './templates.js';

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function formatPhase(phase) {
  return String(phase ?? 'battle joined').replaceAll('-', ' ');
}

function qualitativeCohesion(value, state) {
  if (state === 'routed') return 'Routed';
  if (state === 'fractured') return 'Fractured';
  if (state === 'pressured') return 'Pressed';
  if (state === 'ordered') return 'Ordered';
  const cohesion = clamp01(value);
  if (cohesion >= 0.72) return 'Steady';
  if (cohesion >= 0.45) return 'Pressed';
  if (cohesion >= 0.22) return 'Fractured';
  return 'Breaking';
}

function createRefMap(root) {
  const refs = {};
  root.querySelectorAll('[data-ref]').forEach((element) => {
    const key = element.dataset.ref.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    refs[key] = element;
  });
  return refs;
}

function normaliseRatio(value, max = 1) {
  const maximum = Math.max(0.0001, Number(max) || 1);
  return clamp01((Number(value) || 0) / maximum);
}

const DEFAULT_TUTORIALS = Object.freeze({
  move: { keys: ['W', 'A', 'S', 'D'], text: 'Move through the baggage line' },
  look: { keys: ['MOUSE'], text: 'Look across the field' },
  attack: { keys: ['LMB'], text: 'Attack when your weapon has room to travel' },
  guard: { keys: ['RMB'], text: 'Guard. A well-timed defence preserves stamina' },
  heavy: { keys: ['SHIFT', 'LMB'], text: 'Commit to a heavy attack' },
  interact: { keys: ['E'], text: 'Recover the fallen standard' },
  command: { keys: ['Q', 'R', 'F'], text: 'Rally, brace, or order the advance' },
});

/**
 * DOM presentation system. It mounts into document.body by default and does not
 * require any index.html changes.
 */
export function createHUD(options = {}) {
  const documentRef = options.document ?? globalThis.document;
  if (!documentRef?.createElement) {
    return createHeadlessHUD();
  }

  ensureUIStyles(documentRef);
  const campaign = options.campaign ?? CAMPAIGN;
  const root = documentRef.createElement('div');
  root.className = 'as-ui';
  root.dataset.mode = options.showStart === false ? 'hidden' : 'game';
  root.dataset.active = options.showStart === false ? 'false' : 'true';
  root.setAttribute('aria-label', `${campaign.title} game interface`);
  root.innerHTML = createHUDTemplate(campaign);
  (options.container ?? documentRef.body ?? documentRef.documentElement).append(root);

  const refs = createRefMap(root);
  const listeners = new Map();
  const timeouts = new Set();
  const state = {
    mode: options.showStart === false ? 'hidden' : 'game',
    health: 1,
    stamina: 1,
    objective: null,
    battle: {
      phase: 'vanguard scattered',
      allied: { cohesion: 0.32, state: 'fractured' },
      enemy: { cohesion: 0.9, state: 'ordered' },
    },
    kills: 0,
    disposed: false,
  };
  let announcementToken = 0;
  let subtitleToken = 0;
  let tutorialToken = 0;
  let panelReturnFocus = null;

  const later = (callback, delay) => {
    const id = globalThis.setTimeout(() => {
      timeouts.delete(id);
      callback();
    }, Math.max(0, delay));
    timeouts.add(id);
    return id;
  };

  const emit = (type, detail = {}) => {
    listeners.get(type)?.forEach((listener) => listener(detail));
    listeners.get('*')?.forEach((listener) => listener({ type, ...detail }));
    options.onEvent?.(type, detail);
  };

  const on = (type, listener) => {
    if (typeof listener !== 'function') return () => {};
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(listener);
    return () => listeners.get(type)?.delete(listener);
  };

  const setHealth = (value, max = 1) => {
    state.health = normaliseRatio(value, max);
    refs.healthFill.style.setProperty('--value', state.health);
    root.dataset.lowHealth = state.health <= 0.28 ? 'true' : 'false';
    root.style.setProperty('--as-vignette', state.health < 0.45 ? (0.45 - state.health) / 0.45 : 0);
  };

  const setStamina = (value, max = 1) => {
    state.stamina = normaliseRatio(value, max);
    refs.staminaFill.style.setProperty('--value', state.stamina);
  };

  const setObjective = (objective = {}, objectiveOptions = {}) => {
    state.objective = {
      id: objective.id ?? 'objective',
      title: objective.title ?? objective.short ?? '',
      detail: objective.detail ?? '',
      progress: clamp01(objective.progress ?? objectiveOptions.progress ?? 0),
      state: objective.state ?? 'active',
    };
    refs.objective.dataset.state = 'enter';
    refs.objectiveKicker.textContent =
      state.objective.state === 'complete' ? 'Objective complete' : 'Current objective';
    refs.objectiveTitle.textContent = state.objective.title;
    refs.objectiveDetail.textContent = state.objective.detail;
    refs.objectiveProgress.style.setProperty('--progress', state.objective.progress);
    later(() => {
      refs.objective.dataset.state = state.objective?.state === 'complete' ? 'complete' : 'active';
    }, 30);
  };

  const updateObjective = (progress, detail) => {
    if (!state.objective) return;
    state.objective.progress = clamp01(progress);
    if (detail) {
      state.objective.detail = detail;
      refs.objectiveDetail.textContent = detail;
    }
    refs.objectiveProgress.style.setProperty('--progress', state.objective.progress);
  };

  const completeObjective = (objective = state.objective) => {
    if (!objective) return;
    setObjective({ ...objective, progress: 1, state: 'complete' });
    refs.objectiveKicker.textContent = 'Objective complete';
    refs.objective.dataset.state = 'active';
    later(() => {
      refs.objective.dataset.state = 'complete';
    }, 1050);
  };

  const setBattleStatus = (battle = {}) => {
    if (battle.phase) state.battle.phase = battle.phase;
    for (const side of ['allied', 'enemy']) {
      if (!battle[side]) continue;
      state.battle[side] = {
        ...state.battle[side],
        ...battle[side],
        cohesion: clamp01(battle[side].cohesion ?? state.battle[side].cohesion),
      };
    }
    refs.battlePhase.textContent = battle.label ?? formatPhase(state.battle.phase);
    for (const side of ['allied', 'enemy']) {
      const row = refs[`${side}Row`];
      row.dataset.state = state.battle[side].state ?? 'ordered';
      refs[`${side}State`].textContent = qualitativeCohesion(
        state.battle[side].cohesion,
        state.battle[side].state,
      );
    }
  };

  const setReticle = (reticle = 'default') => {
    const config = typeof reticle === 'string' ? { state: reticle } : reticle;
    refs.reticle.dataset.state = config.state ?? 'default';
    if (config.visible === false) refs.reticle.dataset.state = 'hidden';
    if (config.scale != null) refs.reticle.style.setProperty('--reticle-scale', config.scale);
  };

  const setInteraction = (interaction) => {
    if (!interaction || interaction.visible === false) {
      refs.interaction.dataset.visible = 'false';
      if (refs.reticle.dataset.state === 'interact') setReticle('default');
      return;
    }
    refs.interactionKey.textContent = interaction.key ?? 'E';
    refs.interactionLabel.textContent = interaction.label ?? 'Interact';
    refs.interaction.dataset.visible = 'true';
    setReticle('interact');
  };

  const setCaptainEncounter = (encounter = {}) => {
    if (!encounter || encounter.visible === false) {
      refs.encounter.dataset.visible = 'false';
      return;
    }
    const health = normaliseRatio(encounter.health, encounter.maxHealth);
    refs.encounterName.textContent = encounter.name ?? 'Captain of Saint-Orens';
    refs.encounterPhase.textContent = formatPhase(encounter.phase ?? 'commanding');
    refs.encounterFill.style.setProperty('--value', health);
    refs.encounter.dataset.phase = encounter.phase ?? 'commanding';
    refs.encounter.dataset.visible = 'true';
  };

  const showTutorial = (cue, cueOptions = {}) => {
    const token = ++tutorialToken;
    const content = typeof cue === 'string' ? DEFAULT_TUTORIALS[cue] ?? { text: cue } : cue;
    refs.tutorial.innerHTML = '';
    for (const key of content.keys ?? (content.key ? [content.key] : [])) {
      const keyElement = documentRef.createElement('span');
      keyElement.className = 'as-key';
      keyElement.textContent = key;
      refs.tutorial.append(keyElement);
    }
    const text = documentRef.createElement('span');
    text.textContent = content.text ?? '';
    refs.tutorial.append(text);
    refs.tutorial.dataset.visible = 'true';
    later(() => {
      if (token === tutorialToken) refs.tutorial.dataset.visible = 'false';
    }, (cueOptions.duration ?? content.duration ?? 5) * 1000);
  };

  const setCommands = (commands = [], commandOptions = {}) => {
    refs.commandStrip.innerHTML = '';
    commands.forEach((command, index) => {
      const item = documentRef.createElement('span');
      item.className = 'as-command';
      item.dataset.active = command.id === commandOptions.active ? 'true' : 'false';
      item.textContent = `${command.key ?? index + 1} ${command.label ?? command.id}`;
      refs.commandStrip.append(item);
    });
    refs.commandStrip.dataset.visible = commands.length ? 'true' : 'false';
  };

  const announce = (title, detail = '', announcementOptions = {}) => {
    const token = ++announcementToken;
    refs.announcementTitle.textContent = title ?? '';
    refs.announcementDetail.textContent = detail ?? '';
    refs.announcement.dataset.tone = announcementOptions.tone ?? 'neutral';
    refs.announcement.dataset.visible = 'true';
    later(() => {
      if (token === announcementToken) refs.announcement.dataset.visible = 'false';
    }, (announcementOptions.duration ?? 2.75) * 1000);
  };

  const showSubtitle = (speaker, text, subtitleOptions = {}) => {
    const token = ++subtitleToken;
    refs.subtitleSpeaker.textContent = speaker ? `${speaker}:` : '';
    refs.subtitleText.textContent = text ?? '';
    refs.subtitle.dataset.visible = 'true';
    later(() => {
      if (token === subtitleToken) refs.subtitle.dataset.visible = 'false';
    }, (subtitleOptions.duration ?? 5.5) * 1000);
  };

  const showHit = (kind = 'flesh') => {
    refs.hitMarker.dataset.kind = kind;
    refs.hitMarker.dataset.active = 'false';
    void refs.hitMarker.offsetWidth;
    refs.hitMarker.dataset.active = 'true';
  };

  const showDamage = (damage = {}) => {
    const intensity = clamp01(damage.intensity ?? damage.amount ?? 0.45);
    root.style.setProperty('--as-damage', intensity);
    refs.damageDirection.style.setProperty('--angle', `${Number(damage.angle) || 0}deg`);
    refs.damageDirection.dataset.active = 'false';
    void refs.damageDirection.offsetWidth;
    refs.damageDirection.dataset.active = 'true';
    later(() => root.style.setProperty('--as-damage', 0), 160);
  };

  const showKill = (kill = {}) => {
    state.kills += 1;
    const item = documentRef.createElement('div');
    item.className = 'as-kill-item';
    const strong = documentRef.createElement('strong');
    strong.textContent = kill.label ?? (kill.officer ? 'Officer felled' : 'Enemy down');
    item.append(strong);
    if (kill.detail) item.append(documentRef.createTextNode(` · ${kill.detail}`));
    refs.killFeed.prepend(item);
    later(() => item.remove(), 3900);
    showHit('kill');
  };

  const hidePanel = () => {
    refs.panelScrim.dataset.visible = 'false';
    root.dataset.mode = 'game';
    root.dataset.active = 'true';
    state.mode = 'game';
    panelReturnFocus?.focus?.();
    panelReturnFocus = null;
  };

  const showPanel = (mode, panel) => {
    state.mode = mode;
    root.dataset.mode = mode;
    root.dataset.active = mode === 'menu' ? 'false' : 'true';
    panelReturnFocus = documentRef.activeElement;
    fillPanel(refs, panel);
    refs.panelScrim.dataset.visible = 'true';
    later(() => refs.panelActions.querySelector('button')?.focus(), 30);
  };

  const showStart = (startOptions = {}) => {
    showPanel('menu', {
      kicker: campaign.mission.kicker,
      title: campaign.title,
      subtitle: `${campaign.subtitle} · ${campaign.place}`,
      body: campaign.mission.briefing,
      order: campaign.mission.order,
      actions: [
        { id: 'start', label: startOptions.label ?? 'Enter the battle', primary: true },
      ],
    });
  };

  const showPause = () => {
    showPanel('pause', {
      kicker: campaign.mission.kicker,
      title: 'Battle Paused',
      subtitle: campaign.subtitle,
      body: state.objective?.title
        ? `Current order: ${state.objective.title}`
        : campaign.mission.order,
      actions: [
        { id: 'resume', label: 'Return to battle', primary: true },
        { id: 'restart', label: 'Restart mission' },
      ],
    });
  };

  const showDeath = (deathOptions = {}) => {
    const ending = deathOptions.ending ?? campaign.endings.death;
    showPanel('death', {
      kicker: ending.eyebrow,
      title: ending.title,
      subtitle: `${campaign.place} · ${campaign.date}`,
      body: ending.body,
      stats: deathOptions.stats ?? [{ label: 'Enemies felled', value: state.kills }],
      actions: [{ id: 'restart', label: 'Return to the baggage line', primary: true }],
    });
  };

  const showVictory = (victoryOptions = {}) => {
    const ending = victoryOptions.ending ?? campaign.endings.victory;
    showPanel('victory', {
      kicker: ending.eyebrow,
      title: ending.title,
      subtitle: `${campaign.subtitle} · ${campaign.date}`,
      body: ending.body,
      stats: victoryOptions.stats ?? [{ label: 'Enemies felled', value: state.kills }],
      actions: [{ id: 'restart', label: 'Fight again', primary: true }],
    });
  };

  const setPaused = (paused) => {
    if (paused) showPause();
    else hidePanel();
  };

  const handlePanelClick = (event) => {
    const button = event.target.closest?.('[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    if (action === 'resume') hidePanel();
    emit(`action:${action}`, { action, sourceEvent: event });
  };
  refs.panelScrim.addEventListener('click', handlePanelClick);

  const handleEvent = (type, detail = {}) => {
    switch (type) {
      case 'player:health':
      case 'health':
        setHealth(detail.value ?? detail.health, detail.max ?? detail.maxHealth);
        break;
      case 'player:stamina':
      case 'stamina':
        setStamina(detail.value ?? detail.stamina, detail.max ?? detail.maxStamina);
        break;
      case 'objective:set':
        setObjective(detail.objective ?? detail, detail);
        break;
      case 'objective:progress':
        updateObjective(detail.objective?.progress ?? detail.progress, detail.objective?.detail ?? detail.detail);
        break;
      case 'objective:complete':
        completeObjective(detail.objective ?? detail);
        break;
      case 'battle:status':
        setBattleStatus(detail);
        break;
      case 'battle:phase':
        setBattleStatus(detail);
        break;
      case 'interaction':
        setInteraction(detail);
        break;
      case 'encounter:captain':
        setCaptainEncounter(detail);
        break;
      case 'reticle':
        setReticle(detail);
        break;
      case 'tutorial':
        showTutorial(detail.cue ?? detail, detail);
        break;
      case 'commands':
        setCommands(detail.commands, detail);
        break;
      case 'announcement':
        announce(detail.title, detail.detail, detail);
        break;
      case 'subtitle':
        showSubtitle(detail.speaker, detail.text, detail);
        break;
      case 'combat:hit':
      case 'combat:impact':
      case 'hit':
        showHit(detail.kind ?? detail.material ?? 'flesh');
        break;
      case 'player:damage':
      case 'damage':
        showDamage(detail);
        break;
      case 'combat:kill':
      case 'kill':
        showKill(detail);
        break;
      case 'mission:start':
        hidePanel();
        break;
      case 'mission:complete':
      case 'victory':
        showVictory(detail);
        break;
      case 'mission:fail':
      case 'death':
      case 'player:death':
        showDeath(detail);
        break;
      case 'pause':
        setPaused(true);
        break;
      case 'resume':
        setPaused(false);
        break;
      default:
        break;
    }
  };

  const update = (frame = {}) => {
    if (frame.health != null) setHealth(frame.health, frame.maxHealth ?? 1);
    if (frame.stamina != null) setStamina(frame.stamina, frame.maxStamina ?? 1);
    if (frame.objectiveProgress != null) updateObjective(frame.objectiveProgress);
    if (frame.battle) setBattleStatus(frame.battle);
    if (frame.reticle) setReticle(frame.reticle);
    if ('interaction' in frame) setInteraction(frame.interaction);
    if ('captainEncounter' in frame) setCaptainEncounter(frame.captainEncounter);
  };

  const getState = () => ({
    ...state,
    objective: state.objective ? { ...state.objective } : null,
    battle: {
      ...state.battle,
      allied: { ...state.battle.allied },
      enemy: { ...state.battle.enemy },
    },
  });

  const dispose = () => {
    if (state.disposed) return;
    state.disposed = true;
    refs.panelScrim.removeEventListener('click', handlePanelClick);
    timeouts.forEach((id) => globalThis.clearTimeout(id));
    timeouts.clear();
    listeners.clear();
    root.remove();
  };

  setHealth(options.health ?? 1, options.maxHealth ?? 1);
  setStamina(options.stamina ?? 1, options.maxStamina ?? 1);
  setBattleStatus(options.battle ?? state.battle);
  if (options.showStart !== false) showStart(options.start ?? {});

  return {
    root,
    campaign,
    setHealth,
    setStamina,
    setObjective,
    updateObjective,
    completeObjective,
    setBattleStatus,
    setReticle,
    setInteraction,
    setCaptainEncounter,
    setCommands,
    showTutorial,
    announce,
    showSubtitle,
    showHit,
    showDamage,
    showKill,
    showStart,
    showPause,
    showDeath,
    showVictory,
    setPaused,
    hidePanel,
    handleEvent,
    update,
    on,
    getState,
    dispose,
  };
}

function createHeadlessHUD() {
  const listeners = new Map();
  const state = { mode: 'headless', disposed: false };
  const on = (type, listener) => {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(listener);
    return () => listeners.get(type)?.delete(listener);
  };
  const noOp = () => {};
  return {
    root: null,
    setHealth: noOp,
    setStamina: noOp,
    setObjective: noOp,
    updateObjective: noOp,
    completeObjective: noOp,
    setBattleStatus: noOp,
    setReticle: noOp,
    setInteraction: noOp,
    setCaptainEncounter: noOp,
    setCommands: noOp,
    showTutorial: noOp,
    announce: noOp,
    showSubtitle: noOp,
    showHit: noOp,
    showDamage: noOp,
    showKill: noOp,
    showStart: noOp,
    showPause: noOp,
    showDeath: noOp,
    showVictory: noOp,
    setPaused: noOp,
    hidePanel: noOp,
    handleEvent: noOp,
    update: noOp,
    on,
    getState: () => ({ ...state }),
    dispose: () => {
      state.disposed = true;
      listeners.clear();
    },
  };
}
