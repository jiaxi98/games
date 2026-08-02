import {
  connectFilteredNoise,
  createNoiseBuffer,
  createSpatialNode,
  envelope,
  setParam,
  setPannerPosition,
} from './procedural.js';
import { getBattlePhase } from '../narrative/battlePhases.js';

const AudioContextClass = () => globalThis.AudioContext ?? globalThis.webkitAudioContext;

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function createRandom(seed = 1356) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function vectorComponents(value, fallback = [0, 0, 0]) {
  if (!value) return fallback;
  return [
    Number(value.x ?? value[0]) || 0,
    Number(value.y ?? value[1]) || 0,
    Number(value.z ?? value[2]) || 0,
  ];
}

/**
 * Procedural WebAudio presentation for the battlefield. No fetched or copied
 * samples are used: wind, rain, battle beds, movement, contact and UI cues are
 * synthesized from oscillators and deterministic noise buffers.
 */
export function createAudioSystem(options = {}) {
  const listeners = new Map();
  const random = createRandom(options.seed ?? 1356);
  let context = options.context ?? null;
  let nodes = null;
  let started = false;
  let disposed = false;
  let battleIntensity = clamp(options.battleIntensity ?? 0.25);
  let weatherIntensity = clamp(options.weatherIntensity ?? 0.72);
  let movementAmount = 0;
  let armorTimer = 0;
  let distantTimer = 0.4;
  let rainTimer = 0.2;
  let mixState = 'playing';
  let eventClock = 0;
  const semanticCooldowns = new Map();

  const emit = (type, detail = {}) => {
    listeners.get(type)?.forEach((listener) => listener(detail));
    listeners.get('*')?.forEach((listener) => listener({ type, ...detail }));
  };

  const on = (type, listener) => {
    if (typeof listener !== 'function') return () => {};
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(listener);
    return () => listeners.get(type)?.delete(listener);
  };

  const ensureContext = () => {
    if (disposed) return null;
    if (!context) {
      const Ctor = AudioContextClass();
      if (!Ctor) return null;
      context = new Ctor({ latencyHint: 'interactive' });
    }
    if (!nodes) nodes = createGraph(context, options);
    return context;
  };

  const resume = async () => {
    const audioContext = ensureContext();
    if (!audioContext) return false;
    try {
      if (audioContext.state === 'suspended') await audioContext.resume();
      if (!started) {
        startAmbience();
        started = true;
      }
      emit('state', { state: audioContext.state });
      return audioContext.state === 'running';
    } catch {
      return false;
    }
  };

  const suspend = async () => {
    if (!context || context.state !== 'running') return;
    await context.suspend();
    emit('state', { state: context.state });
  };

  const startAmbience = () => {
    if (!context || !nodes || nodes.ambienceStarted) return;
    nodes.ambienceStarted = true;
    nodes.wind.source.start();
    nodes.rain.source.start();
    nodes.battle.source.start();
    setWeatherIntensity(weatherIntensity);
    setBattleIntensity(battleIntensity);
  };

  const setMasterVolume = (value, seconds = 0.1) => {
    if (!ensureContext()) return;
    setParam(nodes.master.gain, clamp(value), context, seconds);
  };

  const setBusVolume = (name, value, seconds = 0.1) => {
    if (!ensureContext() || !nodes.buses[name]) return;
    setParam(nodes.buses[name].gain, clamp(value), context, seconds);
  };

  const setBattleIntensity = (value) => {
    battleIntensity = clamp(value);
    if (!nodes || !context) return;
    setParam(nodes.battleGain.gain, 0.014 + battleIntensity * 0.11, context, 0.8);
    nodes.battle.filter.frequency.setTargetAtTime(310 + battleIntensity * 680, context.currentTime, 0.6);
  };

  const setWeatherIntensity = (value) => {
    weatherIntensity = clamp(value);
    if (!nodes || !context) return;
    setParam(nodes.windGain.gain, 0.018 + weatherIntensity * 0.065, context, 0.7);
    setParam(nodes.rainGain.gain, 0.012 + weatherIntensity * 0.075, context, 0.7);
  };

  const setMovement = (movement = {}) => {
    movementAmount = clamp(movement.amount ?? movement.speed ?? movement, 0, 1.5);
  };

  const canPlaySemantic = (key, cooldown = 0.25) => {
    const readyAt = semanticCooldowns.get(key) ?? -Infinity;
    if (eventClock < readyAt) return false;
    semanticCooldowns.set(key, eventClock + cooldown);
    return true;
  };

  const setMixState = (nextState = 'playing') => {
    mixState = nextState;
    if (!nodes || !context) return;
    const mix = {
      playing: { master: options.masterVolume ?? 0.86, ambience: options.ambienceVolume ?? 0.72, effects: options.effectsVolume ?? 0.9, ui: options.uiVolume ?? 0.72 },
      pause: { master: 0.58, ambience: 0.11, effects: 0.25, ui: 0.72 },
      death: { master: 0.6, ambience: 0.08, effects: 0.16, ui: 0.62 },
      victory: { master: 0.82, ambience: 0.34, effects: 0.36, ui: 0.72 },
    }[nextState] ?? {};
    setParam(nodes.master.gain, mix.master ?? 0.86, context, 0.35);
    setParam(nodes.buses.ambience.gain, mix.ambience ?? 0.72, context, 0.35);
    setParam(nodes.buses.effects.gain, mix.effects ?? 0.9, context, 0.35);
    setParam(nodes.buses.ui.gain, mix.ui ?? 0.72, context, 0.25);
  };

  const playNoiseBurst = (config = {}) => {
    if (!ensureContext() || context.state !== 'running') return null;
    const destination = config.destination ?? nodes.buses.effects;
    const spatial = createSpatialNode(context, config.position);
    const env = envelope(context, spatial ?? destination, {
      attack: config.attack ?? 0.002,
      decay: config.decay ?? 0.045,
      sustain: config.sustain ?? 0.0001,
      duration: config.duration ?? 0.08,
      release: config.release ?? 0.08,
      peak: config.volume ?? 0.3,
    });
    if (spatial) spatial.connect(destination);
    const burst = connectFilteredNoise(context, nodes.noise.white, env.node, {
      frequency: config.frequency ?? 900,
      q: config.q ?? 0.7,
      filterType: config.filterType ?? 'bandpass',
      playbackRate: config.playbackRate ?? 1,
    });
    burst.source.start(env.start, random() * 0.6);
    burst.source.stop(env.end);
    return { ...burst, spatial };
  };

  const playTone = (config = {}) => {
    if (!ensureContext() || context.state !== 'running') return null;
    const destination = config.destination ?? nodes.buses.effects;
    const spatial = createSpatialNode(context, config.position);
    const env = envelope(context, spatial ?? destination, {
      attack: config.attack ?? 0.004,
      decay: config.decay ?? 0.08,
      sustain: config.sustain ?? 0.0001,
      duration: config.duration ?? 0.14,
      release: config.release ?? 0.1,
      peak: config.volume ?? 0.2,
    });
    if (spatial) spatial.connect(destination);
    const oscillator = context.createOscillator();
    oscillator.type = config.type ?? 'sine';
    oscillator.frequency.setValueAtTime(config.frequency ?? 220, env.start);
    if (config.endFrequency) {
      oscillator.frequency.exponentialRampToValueAtTime(config.endFrequency, env.end - 0.02);
    }
    if (config.detune) oscillator.detune.value = config.detune;
    oscillator.connect(env.node);
    oscillator.start(env.start);
    oscillator.stop(env.end);
    return { oscillator, spatial };
  };

  const footstep = (step = {}) => {
    const material = typeof step === 'string' ? step : step.material ?? 'mud';
    const volume = clamp((step.volume ?? 0.24) * (0.75 + movementAmount * 0.3), 0, 0.55);
    const profiles = {
      mud: { frequency: 125, q: 0.75, duration: 0.095, release: 0.12, playbackRate: 0.75 },
      stone: { frequency: 740, q: 1.1, duration: 0.045, release: 0.08, playbackRate: 1.2 },
      grass: { frequency: 320, q: 0.55, duration: 0.08, release: 0.12, playbackRate: 0.86 },
      wood: { frequency: 430, q: 1.4, duration: 0.05, release: 0.1, playbackRate: 1 },
    };
    const profile = profiles[material] ?? profiles.mud;
    playNoiseBurst({ ...profile, volume, position: step.position });
    if (material === 'mud') {
      playTone({
        frequency: 68 + random() * 18,
        endFrequency: 48,
        type: 'sine',
        volume: volume * 0.3,
        duration: 0.08,
        release: 0.11,
        position: step.position,
      });
    }
  };

  const armor = (armorOptions = {}) => {
    const volume = clamp(armorOptions.volume ?? 0.12, 0, 0.38);
    const base = 1480 + random() * 900;
    playTone({
      frequency: base,
      endFrequency: base * 0.72,
      type: 'triangle',
      volume,
      duration: 0.025,
      release: 0.08,
      position: armorOptions.position,
    });
    playTone({
      frequency: base * 1.57,
      endFrequency: base,
      type: 'sine',
      volume: volume * 0.42,
      duration: 0.018,
      release: 0.06,
      position: armorOptions.position,
    });
  };

  const weaponWhoosh = (whooshOptions = {}) => {
    playNoiseBurst({
      frequency: 850 + random() * 600,
      q: 0.55,
      filterType: 'bandpass',
      playbackRate: 0.8 + random() * 0.35,
      volume: clamp(whooshOptions.volume ?? 0.2, 0, 0.5),
      attack: 0.018,
      decay: 0.08,
      duration: 0.13,
      release: 0.08,
      position: whooshOptions.position,
    });
  };

  const impact = (impactOptions = {}) => {
    if (typeof impactOptions === 'string') impactOptions = { material: impactOptions };
    const result = typeof impactOptions === 'object' ? impactOptions.result : null;
    const outcome = impactOptions.outcome ?? result?.outcome;
    const material = outcome === 'parried'
      ? 'parry'
      : outcome === 'blocked'
        ? 'block'
        : outcome === 'guard-broken'
          ? 'guard-break'
          : impactOptions.material ?? 'flesh';
    const severity = clamp(impactOptions.severity ?? 0.65);
    const position = impactOptions.position;
    if (material === 'parry') {
      playNoiseBurst({
        frequency: 2800,
        q: 2.4,
        duration: 0.022,
        release: 0.07,
        volume: 0.38 + severity * 0.18,
        position,
      });
      playTone({
        frequency: 1680,
        endFrequency: 980,
        type: 'triangle',
        volume: 0.27 + severity * 0.16,
        duration: 0.035,
        release: 0.24,
        position,
      });
    } else if (material === 'guard-break') {
      playNoiseBurst({
        frequency: 520,
        q: 0.75,
        duration: 0.12,
        release: 0.2,
        volume: 0.42 + severity * 0.2,
        position,
      });
      playTone({
        frequency: 142,
        endFrequency: 54,
        type: 'sawtooth',
        volume: 0.28 + severity * 0.16,
        duration: 0.12,
        release: 0.28,
        position,
      });
    } else if (material === 'block') {
      playNoiseBurst({
        frequency: 780,
        q: 1.25,
        duration: 0.055,
        release: 0.12,
        volume: 0.28 + severity * 0.2,
        position,
      });
      playTone({
        frequency: 410,
        endFrequency: 230,
        type: 'triangle',
        volume: 0.18 + severity * 0.16,
        duration: 0.06,
        release: 0.16,
        position,
      });
    } else if (material === 'metal' || material === 'armor' || material === 'weapon') {
      const frequency = 920 + random() * 620;
      playNoiseBurst({
        frequency: 1650,
        q: 1.8,
        duration: 0.035,
        release: 0.08,
        volume: 0.24 + severity * 0.24,
        position,
      });
      playTone({
        frequency,
        endFrequency: frequency * 0.62,
        type: 'triangle',
        volume: 0.18 + severity * 0.2,
        duration: 0.045,
        release: 0.22,
        position,
      });
    } else if (material === 'shield' || material === 'wood') {
      playNoiseBurst({
        frequency: 360,
        q: 1.2,
        duration: 0.06,
        release: 0.14,
        volume: 0.24 + severity * 0.24,
        position,
      });
      playTone({
        frequency: 115,
        endFrequency: 72,
        type: 'triangle',
        volume: 0.12 + severity * 0.16,
        duration: 0.07,
        release: 0.12,
        position,
      });
    } else {
      playNoiseBurst({
        frequency: 185,
        q: 0.75,
        duration: 0.06,
        release: 0.13,
        playbackRate: 0.7,
        volume: 0.2 + severity * 0.24,
        position,
      });
      playTone({
        frequency: 82,
        endFrequency: 54,
        type: 'sine',
        volume: 0.1 + severity * 0.14,
        duration: 0.06,
        release: 0.12,
        position,
      });
    }
  };

  const exhaustion = (exhaustionOptions = {}) => {
    if (!canPlaySemantic('exhaustion', 0.65)) return;
    playNoiseBurst({
      frequency: 145,
      q: 0.42,
      playbackRate: 0.58,
      volume: clamp(exhaustionOptions.volume ?? 0.18, 0, 0.35),
      duration: 0.18,
      release: 0.28,
      destination: nodes?.buses.ui,
    });
    playTone({
      frequency: 108,
      endFrequency: 48,
      type: 'sine',
      volume: 0.12,
      duration: 0.16,
      release: 0.25,
      destination: nodes?.buses.ui,
    });
  };

  const semantic = (kind, detail = {}) => {
    const profiles = {
      command: { cooldown: 0.3, frequency: detail.success === false ? 170 : 310, endFrequency: detail.success === false ? 125 : 430, volume: 0.08 },
      cohesion: { cooldown: 1.1, frequency: detail.state === 'routed' ? 116 : 210, endFrequency: detail.state === 'routed' ? 64 : 260, volume: detail.state === 'routed' ? 0.12 : 0.065 },
      reversal: { cooldown: 1.8, horn: true },
      casualty: { cooldown: 0.22, frequency: 86, endFrequency: 54, volume: detail.officer ? 0.12 : 0.055 },
      aiImpact: { cooldown: 0.12, noise: true },
    };
    const profile = profiles[kind];
    if (!profile || !canPlaySemantic(kind, profile.cooldown)) return;
    if (profile.horn) {
      horn({ ...detail, volume: 0.085 });
    } else if (profile.noise) {
      impact({
        material: detail.material ?? 'armor',
        outcome: detail.outcome,
        severity: detail.severity ?? 0.3,
        position: detail.position,
      });
    } else {
      playTone({
        frequency: profile.frequency,
        endFrequency: profile.endFrequency,
        type: 'triangle',
        volume: profile.volume,
        duration: 0.08,
        release: 0.16,
        position: detail.position,
        destination: detail.position ? undefined : nodes?.buses.ui,
      });
    }
  };

  const damage = (damageOptions = {}) => {
    playTone({
      frequency: 72,
      endFrequency: 42,
      type: 'sine',
      volume: clamp(0.16 + (damageOptions.intensity ?? 0.5) * 0.2),
      duration: 0.11,
      release: 0.2,
      destination: nodes?.buses.ui,
    });
    playNoiseBurst({
      frequency: 210,
      q: 0.6,
      playbackRate: 0.65,
      volume: 0.2,
      duration: 0.08,
      release: 0.16,
      destination: nodes?.buses.ui,
    });
  };

  const ui = (name = 'select') => {
    const cues = {
      hover: { frequency: 620, endFrequency: 660, volume: 0.055, duration: 0.035, release: 0.04 },
      select: { frequency: 390, endFrequency: 520, volume: 0.08, duration: 0.055, release: 0.07 },
      objective: { frequency: 330, endFrequency: 440, volume: 0.09, duration: 0.11, release: 0.18 },
      complete: { frequency: 392, endFrequency: 587, volume: 0.1, duration: 0.18, release: 0.28 },
      pause: { frequency: 230, endFrequency: 185, volume: 0.08, duration: 0.08, release: 0.12 },
      error: { frequency: 165, endFrequency: 135, volume: 0.085, duration: 0.11, release: 0.1 },
    };
    playTone({ ...(cues[name] ?? cues.select), type: 'triangle', destination: nodes?.buses.ui });
  };

  const horn = (hornOptions = {}) => {
    if (!ensureContext() || context.state !== 'running') return;
    const destination = nodes.buses.ambience;
    const spatial = createSpatialNode(context, hornOptions.position ?? { x: -24, y: 2, z: -46 });
    const output = spatial ?? destination;
    if (spatial) spatial.connect(destination);
    const now = context.currentTime;
    [110, 165, 220].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = index === 0 ? 'sawtooth' : 'triangle';
      oscillator.frequency.setValueAtTime(frequency, now);
      oscillator.frequency.linearRampToValueAtTime(frequency * 1.018, now + 0.65);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime((hornOptions.volume ?? 0.08) / (index + 1), now + 0.16);
      gain.gain.setValueAtTime((hornOptions.volume ?? 0.08) / (index + 1), now + 0.65);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.35);
      oscillator.connect(gain);
      gain.connect(output);
      oscillator.start(now);
      oscillator.stop(now + 1.38);
    });
  };

  const kill = (killOptions = {}) => {
    impact({ material: killOptions.material ?? 'flesh', severity: 1, position: killOptions.position });
    playTone({
      frequency: killOptions.officer ? 120 : 96,
      endFrequency: 58,
      type: 'triangle',
      volume: killOptions.officer ? 0.16 : 0.1,
      duration: 0.08,
      release: 0.22,
      destination: nodes?.buses.ui,
    });
  };

  const setListener = (listener = {}) => {
    if (!ensureContext()) return;
    const audioListener = context.listener;
    const [x, y, z] = vectorComponents(listener.position);
    const [fx, fy, fz] = vectorComponents(listener.forward, [0, 0, -1]);
    const [ux, uy, uz] = vectorComponents(listener.up, [0, 1, 0]);
    const now = context.currentTime;
    if (audioListener.positionX) {
      audioListener.positionX.setValueAtTime(x, now);
      audioListener.positionY.setValueAtTime(y, now);
      audioListener.positionZ.setValueAtTime(z, now);
      audioListener.forwardX.setValueAtTime(fx, now);
      audioListener.forwardY.setValueAtTime(fy, now);
      audioListener.forwardZ.setValueAtTime(fz, now);
      audioListener.upX.setValueAtTime(ux, now);
      audioListener.upY.setValueAtTime(uy, now);
      audioListener.upZ.setValueAtTime(uz, now);
    } else {
      audioListener.setPosition(x, y, z);
      audioListener.setOrientation(fx, fy, fz, ux, uy, uz);
    }
  };

  const setDistantBattlePosition = (position) => {
    if (nodes?.battlePanner && context) {
      setPannerPosition(nodes.battlePanner, position, context.currentTime);
    }
  };

  const update = (deltaSeconds, frame = {}) => {
    const delta = Math.max(0, Number(deltaSeconds) || 0);
    eventClock += delta;
    if (frame.listener) setListener(frame.listener);
    if (frame.battleIntensity != null) setBattleIntensity(frame.battleIntensity);
    if (frame.weatherIntensity != null) setWeatherIntensity(frame.weatherIntensity);
    if (frame.movement != null) setMovement(frame.movement);
    if (!started || context?.state !== 'running') return;

    armorTimer -= delta;
    distantTimer -= delta;
    rainTimer -= delta;

    if (movementAmount > 0.28 && armorTimer <= 0) {
      armor({ volume: 0.035 + movementAmount * 0.035 });
      armorTimer = 0.34 + random() * 0.42 - movementAmount * 0.1;
    }

    if (distantTimer <= 0) {
      if (random() < battleIntensity * 0.8) {
        const side = random() > 0.5 ? 1 : -1;
        const position = { x: side * (18 + random() * 30), y: 1, z: -32 - random() * 45 };
        if (random() < 0.55) {
          impact({ material: random() < 0.4 ? 'metal' : 'shield', severity: 0.25, position });
        } else {
          playNoiseBurst({
            frequency: 420 + random() * 430,
            q: 0.55,
            volume: 0.035 + battleIntensity * 0.04,
            duration: 0.16,
            release: 0.2,
            position,
            destination: nodes.buses.ambience,
          });
        }
      }
      distantTimer = 0.55 + random() * 1.6 - battleIntensity * 0.4;
    }

    if (weatherIntensity > 0.45 && rainTimer <= 0) {
      playNoiseBurst({
        frequency: 1700 + random() * 1800,
        q: 1.8,
        volume: 0.012 + weatherIntensity * 0.012,
        duration: 0.018,
        release: 0.035,
        destination: nodes.buses.ambience,
      });
      rainTimer = 0.06 + random() * 0.16;
    }
  };

  const handleEvent = (type, detail = {}) => {
    switch (type) {
      case 'footstep':
      case 'player:footstep':
        footstep(detail);
        break;
      case 'armor':
      case 'player:armor':
        armor(detail);
        break;
      case 'weapon:whoosh':
      case 'combat:swing':
        weaponWhoosh(detail);
        break;
      case 'combat:hit':
      case 'combat:impact':
      case 'impact':
        impact(detail);
        if (detail.attacker?.id !== 'player') semantic('aiImpact', detail);
        break;
      case 'player:damage':
      case 'damage':
        damage(detail);
        break;
      case 'combat:kill':
      case 'kill':
        kill(detail);
        break;
      case 'ui':
        ui(detail.name ?? detail.cue);
        break;
      case 'objective:set':
        ui('objective');
        break;
      case 'objective:complete':
        ui('complete');
        break;
      case 'battle:phase':
        setBattleIntensity(detail.intensity ?? getBattlePhase(detail.phase).intensity);
        if (detail.phase === 'ford' || detail.phase === 'victory') horn(detail);
        break;
      case 'command:issued':
        semantic('command', detail);
        break;
      case 'battlefield:cohesion':
        semantic('cohesion', detail);
        break;
      case 'battlefield:rout':
        semantic('cohesion', { ...detail, state: 'routed' });
        break;
      case 'battlefield:reversal':
        semantic('reversal', detail);
        break;
      case 'casualty':
      case 'battlefield:casualty':
        semantic('casualty', detail);
        break;
      case 'battlefield:ai-impact':
        semantic('aiImpact', {
          ...detail,
          outcome: detail.result?.outcome,
          material: detail.result?.material ?? detail.result?.surface,
          severity: detail.result?.severity ?? detail.result?.intensity,
          position: detail.result?.point ?? detail.target?.object3d?.position,
        });
        break;
      case 'combat:exhausted':
      case 'player:exhausted':
      case 'exhaustion':
        exhaustion(detail);
        break;
      case 'pause':
        ui('pause');
        setMixState('pause');
        break;
      case 'resume':
        setMixState('playing');
        break;
      case 'mission:complete':
      case 'victory':
        setMixState('victory');
        horn({ ...detail, volume: 0.11 });
        break;
      case 'mission:fail':
      case 'death':
      case 'player:death':
        setMixState('death');
        playTone({
          frequency: 86,
          endFrequency: 34,
          type: 'sine',
          volume: 0.16,
          duration: 0.4,
          release: 0.8,
          destination: nodes?.buses.ui,
        });
        break;
      default:
        break;
    }
  };

  const connect = (source) => {
    if (!source?.on) return () => {};
    return source.on('*', (event) => handleEvent(event.type, event));
  };

  const getState = () => ({
    available: Boolean(context || AudioContextClass()),
    contextState: context?.state ?? 'uninitialised',
    started,
    battleIntensity,
    weatherIntensity,
    movementAmount,
    mixState,
    disposed,
  });

  const dispose = async () => {
    if (disposed) return;
    disposed = true;
    listeners.clear();
    if (nodes) {
      for (const bed of [nodes.wind, nodes.rain, nodes.battle]) {
        try {
          bed.source.stop();
        } catch {
          // A source that never started is safe to ignore during teardown.
        }
      }
      nodes.master.disconnect();
    }
    if (context && options.context == null && context.state !== 'closed') {
      await context.close();
    }
    nodes = null;
  };

  return {
    start: resume,
    resume,
    suspend,
    setMasterVolume,
    setBusVolume,
    setBattleIntensity,
    setWeatherIntensity,
    setMovement,
    setListener,
    setDistantBattlePosition,
    footstep,
    armorJostle: armor,
    weaponWhoosh,
    impact,
    damage,
    kill,
    exhaustion,
    semantic,
    setMixState,
    ui,
    horn,
    handleEvent,
    connect,
    update,
    on,
    getState,
    dispose,
  };
}

function createGraph(context, options) {
  const master = context.createGain();
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -13;
  compressor.knee.value = 15;
  compressor.ratio.value = 5;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.22;
  master.gain.value = clamp(options.masterVolume ?? 0.86);
  master.connect(compressor);
  compressor.connect(context.destination);

  const buses = {};
  for (const [name, volume] of Object.entries({
    ambience: options.ambienceVolume ?? 0.72,
    effects: options.effectsVolume ?? 0.9,
    ui: options.uiVolume ?? 0.72,
  })) {
    const gain = context.createGain();
    gain.gain.value = clamp(volume);
    gain.connect(master);
    buses[name] = gain;
  }

  const noise = {
    white: createNoiseBuffer(context, 2.4, 'white', 1356),
    pink: createNoiseBuffer(context, 3.7, 'pink', 1415),
    brown: createNoiseBuffer(context, 4.1, 'brown', 1346),
  };

  const windGain = context.createGain();
  const wind = connectFilteredNoise(context, noise.pink, windGain, {
    loop: true,
    frequency: 310,
    q: 0.42,
    filterType: 'lowpass',
    playbackRate: 0.79,
  });
  windGain.gain.value = 0.05;
  windGain.connect(buses.ambience);

  const rainGain = context.createGain();
  const rain = connectFilteredNoise(context, noise.white, rainGain, {
    loop: true,
    frequency: 2700,
    q: 0.55,
    filterType: 'highpass',
    playbackRate: 0.92,
  });
  rainGain.gain.value = 0.06;
  rainGain.connect(buses.ambience);

  const battleGain = context.createGain();
  const battle = connectFilteredNoise(context, noise.brown, battleGain, {
    loop: true,
    frequency: 560,
    q: 0.7,
    filterType: 'bandpass',
    playbackRate: 0.64,
  });
  battleGain.gain.value = 0.04;
  const battlePanner = createSpatialNode(context, options.distantBattlePosition ?? { x: 0, y: 1, z: -55 });
  if (battlePanner) {
    battleGain.connect(battlePanner);
    battlePanner.connect(buses.ambience);
  } else {
    battleGain.connect(buses.ambience);
  }

  return {
    master,
    compressor,
    buses,
    noise,
    wind,
    windGain,
    rain,
    rainGain,
    battle,
    battleGain,
    battlePanner,
    ambienceStarted: false,
  };
}
