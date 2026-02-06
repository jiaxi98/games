import * as planck from 'planck';
import './style.css';
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  LAUNCH_POWER,
  MAX_DRAG_DISTANCE,
  MAX_LAUNCH_SPEED,
  PIXELS_PER_METER,
  POSITION_ITERATIONS,
  ROUND_TIMEOUT_MS,
  STATIONARY_FRAME_LIMIT,
  TIME_STEP,
  VELOCITY_ITERATIONS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from './core/constants';
import { calculateLaunchVelocity, clampDragPosition, computeImpactDamage } from './core/physics';
import { countAlivePigs, createPhysicsScene } from './core/scene';
import type { GamePhase, GameResult, PhysicsEntity, Vec2Like } from './core/types';

const app = requireElement<HTMLDivElement>('#app');
app.innerHTML = `
  <main class="layout">
    <header class="hero">
      <p class="eyebrow">Rigid Body Physics Prototype</p>
      <h1>Slingshot Siege</h1>
      <p class="subtitle">
        Drag the bird backward, release to launch, and collapse the wood structure to eliminate all targets.
      </p>
    </header>
    <section class="hud" aria-live="polite">
      <p>Score <strong id="score">0</strong></p>
      <p>Targets <strong id="targets">0</strong></p>
      <p>State <strong id="state">Idle</strong></p>
      <p>Round <strong id="round-message">Ready to launch</strong></p>
    </section>
    <section class="controls">
      <button id="restart">Restart Round</button>
      <p>Input: mouse or touch drag on bird, release to launch, <kbd>R</kbd> to restart.</p>
    </section>
    <canvas id="world" width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}"></canvas>
  </main>
`;

const canvas = requireElement<HTMLCanvasElement>('#world');
const scoreEl = requireElement<HTMLElement>('#score');
const targetsEl = requireElement<HTMLElement>('#targets');
const stateEl = requireElement<HTMLElement>('#state');
const roundMessageEl = requireElement<HTMLElement>('#round-message');
const restartButton = requireElement<HTMLButtonElement>('#restart');

const context2d = canvas.getContext('2d');
if (!context2d) {
  throw new Error('Failed to initialize 2D canvas context.');
}
const context = context2d;

let scene = createPhysicsScene();
let phase: GamePhase = 'idle';
let result: GameResult = 'pending';
let score = 0;
let launchedAtMs = 0;
let stationaryFrames = 0;
let activePointerId: number | null = null;
const pendingDestroy = new Set<string>();

let lastFrameTime = performance.now();
let accumulator = 0;

bindCollisionListener();
render();
window.requestAnimationFrame(loop);

restartButton.addEventListener('click', () => {
  resetRound();
});

window.addEventListener('keydown', (event) => {
  if (event.key.toLowerCase() === 'r') {
    event.preventDefault();
    resetRound();
  }
});

canvas.addEventListener('pointerdown', (event) => {
  if (phase !== 'idle') {
    return;
  }
  const point = pointerToWorld(event);
  const birdPosition = scene.bird.body.getPosition();
  const distance = Math.hypot(point.x - birdPosition.x, point.y - birdPosition.y);
  if (distance > 0.95) {
    return;
  }

  phase = 'aiming';
  activePointerId = event.pointerId;
  canvas.setPointerCapture(event.pointerId);
  updateAiming(point);
  render();
});

canvas.addEventListener('pointermove', (event) => {
  if (phase !== 'aiming' || activePointerId !== event.pointerId) {
    return;
  }
  updateAiming(pointerToWorld(event));
});

canvas.addEventListener('pointerup', (event) => {
  if (phase !== 'aiming' || activePointerId !== event.pointerId) {
    return;
  }
  releaseLaunch(event.pointerId);
});

canvas.addEventListener('pointercancel', (event) => {
  if (phase !== 'aiming' || activePointerId !== event.pointerId) {
    return;
  }
  releaseLaunch(event.pointerId);
});

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Required element missing: ${selector}`);
  }
  return element;
}

function pointerToWorld(event: PointerEvent): Vec2Like {
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) * canvas.width) / rect.width / PIXELS_PER_METER;
  const y = ((event.clientY - rect.top) * canvas.height) / rect.height / PIXELS_PER_METER;
  return { x, y };
}

function bindCollisionListener(): void {
  scene.world.on('post-solve', (contact, impulse) => {
    const normalImpulse = impulse.normalImpulses.reduce((sum, value) => sum + Math.abs(value), 0);
    const tangentImpulse = impulse.tangentImpulses.reduce((sum, value) => sum + Math.abs(value), 0);
    const totalImpact = normalImpulse + tangentImpulse * 0.35;
    if (totalImpact <= 0) {
      return;
    }
    applyImpact(contact.getFixtureA().getBody(), totalImpact);
    applyImpact(contact.getFixtureB().getBody(), totalImpact);
  });
}

function applyImpact(body: planck.Body, totalImpact: number): void {
  const entity = scene.bodyToEntity.get(body);
  if (!entity || entity.kind === 'bird') {
    return;
  }

  const damage = computeImpactDamage(totalImpact, entity.breakImpulse);
  if (damage <= 0) {
    return;
  }

  entity.health -= damage;
  if (entity.health <= 0) {
    pendingDestroy.add(entity.id);
  }
}

function updateAiming(pointer: Vec2Like): void {
  const clamped = clampDragPosition(scene.anchor, pointer, MAX_DRAG_DISTANCE);
  scene.bird.body.setTransform(planck.Vec2(clamped.x, clamped.y), 0);
  scene.bird.body.setGravityScale(0);
  scene.bird.body.setLinearVelocity(planck.Vec2(0, 0));
  scene.bird.body.setAngularVelocity(0);
  scene.bird.body.setAwake(true);
}

function releaseLaunch(pointerId: number): void {
  if (canvas.hasPointerCapture(pointerId)) {
    canvas.releasePointerCapture(pointerId);
  }
  activePointerId = null;

  const birdPos = scene.bird.body.getPosition();
  const velocity = calculateLaunchVelocity(scene.anchor, birdPos, LAUNCH_POWER, MAX_LAUNCH_SPEED);
  scene.bird.body.setGravityScale(1);
  scene.bird.body.setLinearVelocity(planck.Vec2(velocity.x, velocity.y));
  scene.bird.body.setAngularVelocity(0);
  scene.bird.body.setAwake(true);

  phase = 'launched';
  launchedAtMs = performance.now();
  stationaryFrames = 0;
}

function flushDestroyedBodies(): void {
  for (const entityId of pendingDestroy) {
    const entity = scene.entities.get(entityId);
    if (!entity) {
      continue;
    }
    score += entity.scoreValue;
    scene.bodyToEntity.delete(entity.body);
    scene.world.destroyBody(entity.body);
    scene.entities.delete(entityId);
  }
  pendingDestroy.clear();
}

function updateRoundState(nowMs: number): void {
  if (phase !== 'launched') {
    return;
  }

  const pigsRemaining = countAlivePigs(scene);
  if (pigsRemaining === 0) {
    phase = 'resolved';
    result = 'victory';
    return;
  }

  const birdVelocity = scene.bird.body.getLinearVelocity().length();
  const birdAngularVelocity = Math.abs(scene.bird.body.getAngularVelocity());
  if (birdVelocity < 0.18 && birdAngularVelocity < 0.22) {
    stationaryFrames += 1;
  } else {
    stationaryFrames = 0;
  }

  const birdPos = scene.bird.body.getPosition();
  const outOfBounds =
    birdPos.x < -2 || birdPos.x > WORLD_WIDTH + 2 || birdPos.y < -2 || birdPos.y > WORLD_HEIGHT + 2;
  const timedOut = nowMs - launchedAtMs > ROUND_TIMEOUT_MS;
  if (outOfBounds || timedOut || stationaryFrames > STATIONARY_FRAME_LIMIT) {
    phase = 'resolved';
    result = 'defeat';
  }
}

function resetRound(): void {
  scene = createPhysicsScene();
  bindCollisionListener();
  pendingDestroy.clear();

  phase = 'idle';
  result = 'pending';
  score = 0;
  launchedAtMs = 0;
  stationaryFrames = 0;
  activePointerId = null;
  accumulator = 0;
  lastFrameTime = performance.now();

  render();
}

function loop(nowMs: number): void {
  const frameSeconds = Math.min((nowMs - lastFrameTime) / 1000, 0.05);
  lastFrameTime = nowMs;
  accumulator += frameSeconds;

  while (accumulator >= TIME_STEP) {
    scene.world.step(TIME_STEP, VELOCITY_ITERATIONS, POSITION_ITERATIONS);
    flushDestroyedBodies();
    updateRoundState(nowMs);
    accumulator -= TIME_STEP;
  }

  render();
  window.requestAnimationFrame(loop);
}

function worldToCanvas(value: Vec2Like): Vec2Like {
  return {
    x: value.x * PIXELS_PER_METER,
    y: value.y * PIXELS_PER_METER,
  };
}

function drawBackground(): void {
  const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, '#f8eec9');
  gradient.addColorStop(0.55, '#d8e7c2');
  gradient.addColorStop(1, '#a6c991');

  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const groundTop = scene.groundY * PIXELS_PER_METER;
  context.fillStyle = '#6f8f4f';
  context.fillRect(0, groundTop, canvas.width, canvas.height - groundTop);
}

function drawSlingshot(): void {
  const anchor = worldToCanvas(scene.anchor);
  const postHeight = 70;

  context.fillStyle = '#6f4f32';
  context.fillRect(anchor.x - 18, anchor.y - postHeight, 9, postHeight + 16);
  context.fillRect(anchor.x + 9, anchor.y - postHeight, 9, postHeight + 16);

  if (phase === 'aiming') {
    const birdPos = worldToCanvas(scene.bird.body.getPosition());
    context.strokeStyle = '#4e3825';
    context.lineWidth = 4;
    context.beginPath();
    context.moveTo(anchor.x - 9, anchor.y - postHeight + 12);
    context.lineTo(birdPos.x, birdPos.y);
    context.lineTo(anchor.x + 18, anchor.y - postHeight + 12);
    context.stroke();
  }
}

function drawAimTrajectory(): void {
  if (phase !== 'aiming') {
    return;
  }
  const birdPos = scene.bird.body.getPosition();
  const velocity = calculateLaunchVelocity(scene.anchor, birdPos, LAUNCH_POWER, MAX_LAUNCH_SPEED);
  const gravity = 9.8;

  context.fillStyle = 'rgba(36, 45, 26, 0.7)';
  for (let i = 1; i <= 20; i += 1) {
    const time = i * 0.115;
    const x = birdPos.x + velocity.x * time;
    const y = birdPos.y + velocity.y * time + 0.5 * gravity * time * time;
    if (y > scene.groundY) {
      break;
    }
    const point = worldToCanvas({ x, y });
    context.beginPath();
    context.arc(point.x, point.y, 2.4, 0, Math.PI * 2);
    context.fill();
  }
}

function healthRatio(entity: PhysicsEntity): number {
  if (entity.maxHealth <= 0) {
    return 1;
  }
  return Math.max(0, Math.min(1, entity.health / entity.maxHealth));
}

function drawEntity(entity: PhysicsEntity): void {
  const position = entity.body.getPosition();
  const angle = entity.body.getAngle();
  const point = worldToCanvas(position);
  const integrity = healthRatio(entity);

  context.save();
  context.translate(point.x, point.y);
  context.rotate(angle);

  if (entity.shape.kind === 'circle') {
    const radius = entity.shape.radius * PIXELS_PER_METER;
    context.fillStyle = entity.color;
    context.globalAlpha = 0.45 + integrity * 0.55;
    context.beginPath();
    context.arc(0, 0, radius, 0, Math.PI * 2);
    context.fill();
    context.globalAlpha = 1;

    if (entity.kind === 'pig') {
      context.fillStyle = '#223820';
      context.beginPath();
      context.arc(-radius * 0.26, -radius * 0.1, radius * 0.09, 0, Math.PI * 2);
      context.arc(radius * 0.26, -radius * 0.1, radius * 0.09, 0, Math.PI * 2);
      context.fill();
    }
  } else {
    const width = entity.shape.hx * 2 * PIXELS_PER_METER;
    const height = entity.shape.hy * 2 * PIXELS_PER_METER;
    context.fillStyle = entity.color;
    context.globalAlpha = 0.4 + integrity * 0.6;
    context.fillRect(-width / 2, -height / 2, width, height);
    context.globalAlpha = 1;
    context.strokeStyle = 'rgba(50, 32, 20, 0.28)';
    context.lineWidth = 2;
    context.strokeRect(-width / 2, -height / 2, width, height);
  }

  context.restore();
}

function phaseLabel(): string {
  if (phase === 'resolved') {
    return result === 'victory' ? 'Resolved (Victory)' : 'Resolved (Defeat)';
  }
  return phase[0].toUpperCase() + phase.slice(1);
}

function phaseMessage(): string {
  switch (phase) {
    case 'idle':
      return 'Grab the bird and pull backward.';
    case 'aiming':
      return 'Release to launch.';
    case 'launched':
      return 'Flight in progress.';
    case 'resolved':
      return result === 'victory' ? 'All pigs eliminated.' : 'No more effective motion.';
  }
}

function renderHud(): void {
  scoreEl.textContent = String(score);
  targetsEl.textContent = String(countAlivePigs(scene));
  stateEl.textContent = phaseLabel();
  roundMessageEl.textContent = phaseMessage();
}

function render(): void {
  drawBackground();
  drawAimTrajectory();
  drawSlingshot();

  for (const entity of scene.entities.values()) {
    drawEntity(entity);
  }

  renderHud();
}
