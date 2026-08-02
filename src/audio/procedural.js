export function createNoiseBuffer(context, seconds = 2, colour = 'white', seed = 1356) {
  const length = Math.max(1, Math.floor(context.sampleRate * seconds));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  let state = seed >>> 0;
  let brown = 0;
  let previous = 0;

  const random = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };

  for (let index = 0; index < length; index += 1) {
    const white = random() * 2 - 1;
    if (colour === 'brown') {
      brown = (brown + 0.018 * white) / 1.018;
      data[index] = brown * 3.2;
    } else if (colour === 'pink') {
      previous = previous * 0.92 + white * 0.08;
      data[index] = previous * 2.4;
    } else {
      data[index] = white;
    }
  }
  return buffer;
}

export function envelope(context, destination, config = {}) {
  const now = context.currentTime;
  const gain = context.createGain();
  const attack = Math.max(0.001, config.attack ?? 0.005);
  const decay = Math.max(0.001, config.decay ?? 0.08);
  const sustain = Math.max(0, config.sustain ?? 0);
  const release = Math.max(0.001, config.release ?? 0.12);
  const duration = Math.max(attack + decay, config.duration ?? 0.25);
  const peak = Math.max(0.0001, config.peak ?? 1);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(peak, now + attack);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustain), now + attack + decay);
  gain.gain.setValueAtTime(Math.max(0.0001, sustain), now + duration);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration + release);
  gain.connect(destination);

  return {
    node: gain,
    start: now,
    end: now + duration + release + 0.02,
  };
}

export function connectFilteredNoise(context, buffer, destination, config = {}) {
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = config.loop ?? false;
  source.playbackRate.value = config.playbackRate ?? 1;

  const filter = context.createBiquadFilter();
  filter.type = config.filterType ?? 'bandpass';
  filter.frequency.value = config.frequency ?? 900;
  filter.Q.value = config.q ?? 0.8;
  source.connect(filter);
  filter.connect(destination);
  return { source, filter };
}

export function setParam(param, value, context, seconds = 0.08) {
  const next = Number(value);
  if (!Number.isFinite(next)) return;
  const now = context.currentTime;
  param.cancelScheduledValues(now);
  param.setValueAtTime(Math.max(0.0001, param.value), now);
  param.exponentialRampToValueAtTime(Math.max(0.0001, next), now + Math.max(0.001, seconds));
}

export function createSpatialNode(context, position) {
  if (!position || !context.createPanner) return null;
  const panner = context.createPanner();
  panner.panningModel = 'HRTF';
  panner.distanceModel = 'inverse';
  panner.refDistance = 2;
  panner.maxDistance = 90;
  panner.rolloffFactor = 0.8;
  setPannerPosition(panner, position, context.currentTime);
  return panner;
}

export function setPannerPosition(panner, position, time = 0) {
  const x = Number(position.x ?? position[0]) || 0;
  const y = Number(position.y ?? position[1]) || 0;
  const z = Number(position.z ?? position[2]) || 0;
  if (panner.positionX) {
    panner.positionX.setValueAtTime(x, time);
    panner.positionY.setValueAtTime(y, time);
    panner.positionZ.setValueAtTime(z, time);
  } else {
    panner.setPosition(x, y, z);
  }
}
