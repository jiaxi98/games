export class GameClock {
  constructor({
    fixedStep = 1 / 120,
    maxDelta = 1 / 15,
    maxSubSteps = 8,
  } = {}) {
    this.fixedStep = fixedStep;
    this.maxDelta = maxDelta;
    this.maxSubSteps = maxSubSteps;
    this.elapsed = 0;
    this.accumulator = 0;
    this.lastTime = null;
  }

  reset(timeMs = null) {
    this.lastTime = timeMs;
    this.accumulator = 0;
  }

  tick(timeMs) {
    if (this.lastTime === null) {
      this.lastTime = timeMs;
      return { delta: 0, steps: 0, alpha: 0, elapsed: this.elapsed };
    }

    const rawDelta = Math.max(0, (timeMs - this.lastTime) / 1000);
    const delta = Math.min(rawDelta, this.maxDelta);
    this.lastTime = timeMs;
    this.elapsed += delta;
    this.accumulator += delta;

    const availableSteps = Math.floor((this.accumulator + 1e-10) / this.fixedStep);
    const steps = Math.min(availableSteps, this.maxSubSteps);
    this.accumulator -= steps * this.fixedStep;

    if (availableSteps > this.maxSubSteps) {
      this.accumulator %= this.fixedStep;
    }

    return {
      delta,
      steps,
      alpha: this.accumulator / this.fixedStep,
      elapsed: this.elapsed,
    };
  }
}
