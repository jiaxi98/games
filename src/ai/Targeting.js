import { Vector3 } from 'three';

export function selectTarget(actor, candidates, {
  previousTarget = null,
  maxRange = 18,
  protectPoint = null,
  focusTarget = null,
} = {}) {
  if (focusTarget?.combatant?.alive && focusTarget.factionId !== actor.factionId) {
    return focusTarget;
  }

  let best = null;
  let bestScore = Infinity;
  for (const candidate of candidates) {
    if (
      !candidate ||
      candidate === actor ||
      candidate.factionId === actor.factionId ||
      !candidate.combatant?.alive
    ) continue;

    _delta.copy(candidate.object3d.position).sub(actor.object3d.position);
    const distanceSq = _delta.lengthSq();
    if (distanceSq > maxRange * maxRange) continue;

    let score = distanceSq;
    if (candidate === previousTarget) score *= 0.72;
    if (candidate.role === 'captain' || candidate.role === 'standard-bearer') score *= 0.78;
    if (protectPoint) {
      score += candidate.object3d.position.distanceToSquared(protectPoint) * 0.2;
    }
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

const _delta = new Vector3();

