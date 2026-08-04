import * as planck from 'planck';
import './style.css';
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  GRAVITY_Y,
  LAUNCH_POWER,
  MAX_DRAG_DISTANCE,
  MAX_LAUNCH_SPEED,
  PIXELS_PER_METER,
  POSITION_ITERATIONS,
  TIME_STEP,
  VELOCITY_ITERATIONS,
  WORLD_WIDTH,
} from './core/constants';
import { evaluateRoundState, flushDestroyedBodies } from './core/game-state';
import type { SceneryLayer, SceneryPropConfig } from './core/level';
import { calculateLaunchVelocity, clampDragPosition, clampPointToBounds, computeImpactDamage } from './core/physics';
import { phaseLabel, phaseMessage } from './core/round';
import { countAliveTargets, createPhysicsScene, hasRole } from './core/scene';
import { ENTITY_ROLE } from './core/types';
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
  if (!entity || hasRole(entity, ENTITY_ROLE.PROJECTILE)) {
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
  const radius = scene.bird.shape.kind === 'circle' ? scene.bird.shape.radius : 0;
  const safe = clampPointToBounds(clamped, {
    minX: radius,
    maxX: WORLD_WIDTH - radius,
    minY: radius,
    maxY: scene.groundY - radius - 0.02,
  });

  scene.bird.body.setTransform(planck.Vec2(safe.x, safe.y), 0);
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
    score += flushDestroyedBodies(scene, pendingDestroy);
    const nextRound = evaluateRoundState(
      scene,
      { phase, result, launchedAtMs, stationaryFrames },
      nowMs,
    );
    phase = nextRound.phase;
    result = nextRound.result;
    stationaryFrames = nextRound.stationaryFrames;
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

function worldLengthToCanvas(value: number): number {
  return value * PIXELS_PER_METER;
}

function drawSceneryProp(prop: SceneryPropConfig): void {
  const x = worldLengthToCanvas(prop.x);
  const y = worldLengthToCanvas(prop.y);
  const baseColor = prop.color ?? '#6e8456';
  const scale = prop.scale;

  context.save();
  if (prop.opacity !== undefined) {
    context.globalAlpha = prop.opacity;
  }

  switch (prop.kind) {
    case 'cloud': {
      const width = worldLengthToCanvas((prop.width ?? 2.2) * scale);
      const height = worldLengthToCanvas((prop.height ?? 0.85) * scale);
      context.fillStyle = baseColor === '#6e8456' ? '#f4f6ee' : baseColor;
      context.beginPath();
      context.ellipse(x - width * 0.26, y, width * 0.34, height * 0.4, 0, 0, Math.PI * 2);
      context.ellipse(x + width * 0.08, y - height * 0.08, width * 0.38, height * 0.46, 0, 0, Math.PI * 2);
      context.ellipse(x + width * 0.35, y + height * 0.04, width * 0.3, height * 0.34, 0, 0, Math.PI * 2);
      context.fill();
      break;
    }
    case 'mountain': {
      const width = worldLengthToCanvas((prop.width ?? 6.2) * scale);
      const height = worldLengthToCanvas((prop.height ?? 4.5) * scale);
      context.fillStyle = baseColor;
      context.beginPath();
      context.moveTo(x - width / 2, y);
      context.quadraticCurveTo(x - width * 0.24, y - height * 0.84, x - width * 0.04, y - height);
      context.quadraticCurveTo(x + width * 0.2, y - height * 0.78, x + width / 2, y);
      context.closePath();
      context.fill();
      context.fillStyle = 'rgba(242, 244, 236, 0.26)';
      context.beginPath();
      context.moveTo(x - width * 0.07, y - height * 0.82);
      context.lineTo(x + width * 0.12, y - height * 0.52);
      context.lineTo(x - width * 0.18, y - height * 0.46);
      context.closePath();
      context.fill();
      break;
    }
    case 'hill': {
      const width = worldLengthToCanvas((prop.width ?? 3.4) * scale);
      const height = worldLengthToCanvas((prop.height ?? 1.8) * scale);
      context.fillStyle = baseColor;
      context.beginPath();
      context.ellipse(x, y, width / 2, height / 2, 0, Math.PI, Math.PI * 2);
      context.lineTo(x + width / 2, y);
      context.lineTo(x - width / 2, y);
      context.closePath();
      context.fill();
      break;
    }
    case 'tree': {
      const trunkWidth = worldLengthToCanvas(0.2 * scale);
      const trunkHeight = worldLengthToCanvas(0.8 * scale);
      context.fillStyle = '#5f4a30';
      context.fillRect(x - trunkWidth / 2, y - trunkHeight, trunkWidth, trunkHeight);

      const canopyRadius = worldLengthToCanvas(0.6 * scale);
      context.fillStyle = baseColor;
      context.beginPath();
      context.arc(x, y - trunkHeight, canopyRadius, 0, Math.PI * 2);
      context.arc(x - canopyRadius * 0.68, y - trunkHeight * 0.86, canopyRadius * 0.7, 0, Math.PI * 2);
      context.arc(x + canopyRadius * 0.66, y - trunkHeight * 0.84, canopyRadius * 0.68, 0, Math.PI * 2);
      context.fill();
      break;
    }
    case 'bush': {
      const radius = worldLengthToCanvas(0.42 * scale);
      context.fillStyle = baseColor;
      context.beginPath();
      context.arc(x - radius * 0.8, y - radius * 0.2, radius * 0.75, 0, Math.PI * 2);
      context.arc(x, y - radius * 0.35, radius, 0, Math.PI * 2);
      context.arc(x + radius * 0.82, y - radius * 0.22, radius * 0.72, 0, Math.PI * 2);
      context.fill();
      break;
    }
    case 'rock': {
      const width = worldLengthToCanvas(0.9 * scale);
      const height = worldLengthToCanvas(0.46 * scale);
      context.fillStyle = baseColor;
      context.beginPath();
      context.moveTo(x - width * 0.5, y);
      context.lineTo(x - width * 0.2, y - height);
      context.lineTo(x + width * 0.3, y - height * 0.86);
      context.lineTo(x + width * 0.5, y - height * 0.14);
      context.lineTo(x + width * 0.22, y + height * 0.12);
      context.closePath();
      context.fill();
      break;
    }
    default:
      break;
  }

  context.restore();
}

function drawSceneryLayer(layer: SceneryLayer): void {
  for (const prop of scene.sceneryProps) {
    if (prop.layer === layer) {
      drawSceneryProp(prop);
    }
  }
}

function drawTerrainBlock(block: (typeof scene.terrainBlocks)[number]): void {
  const center = worldToCanvas({ x: block.x, y: block.y });
  const width = block.hx * 2 * PIXELS_PER_METER;
  const height = block.hy * 2 * PIXELS_PER_METER;
  const edgeShade = block.angle === 0 ? 'rgba(52, 68, 42, 0.34)' : 'rgba(37, 51, 31, 0.4)';

  context.save();
  context.translate(center.x, center.y);
  context.rotate(block.angle);
  context.fillStyle = block.color;
  context.fillRect(-width / 2, -height / 2, width, height);
  context.strokeStyle = edgeShade;
  context.lineWidth = 2;
  context.strokeRect(-width / 2, -height / 2, width, height);
  context.restore();
}

function drawBackground(): void {
  const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, '#d8e8f2');
  gradient.addColorStop(0.44, '#d8e6cf');
  gradient.addColorStop(1, '#9fb981');

  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const sun = context.createRadialGradient(
    worldLengthToCanvas(24.5),
    worldLengthToCanvas(3.2),
    worldLengthToCanvas(0.35),
    worldLengthToCanvas(24.5),
    worldLengthToCanvas(3.2),
    worldLengthToCanvas(4.6),
  );
  sun.addColorStop(0, 'rgba(255, 238, 182, 0.52)');
  sun.addColorStop(1, 'rgba(255, 238, 182, 0)');
  context.fillStyle = sun;
  context.fillRect(0, 0, canvas.width, canvas.height);

  drawSceneryLayer('far');
  drawSceneryLayer('mid');

  const groundTop = scene.groundY * PIXELS_PER_METER;
  context.fillStyle = '#5f7c42';
  context.fillRect(0, groundTop, canvas.width, canvas.height - groundTop);

  context.fillStyle = 'rgba(220, 230, 165, 0.2)';
  for (let x = 0; x < canvas.width; x += 46) {
    const y = groundTop + ((x / 46) % 2 === 0 ? 2 : 5);
    context.fillRect(x, y, 18, 3);
  }

  for (const block of scene.terrainBlocks) {
    drawTerrainBlock(block);
  }

  drawSceneryLayer('front');
}

function drawSlingshot(): void {
  const anchor = worldToCanvas(scene.anchor);
  const groundTop = scene.groundY * PIXELS_PER_METER;
  const postTop = anchor.y - 68;
  const postBottom = groundTop + 2;

  context.fillStyle = '#6f4f32';
  context.fillRect(anchor.x - 18, postTop, 9, postBottom - postTop);
  context.fillRect(anchor.x + 9, postTop, 9, postBottom - postTop);

  context.fillStyle = '#835a39';
  context.beginPath();
  context.ellipse(anchor.x, groundTop - 2, 32, 10, 0, 0, Math.PI * 2);
  context.fill();

  if (phase === 'aiming') {
    const birdPos = worldToCanvas(scene.bird.body.getPosition());
    context.strokeStyle = '#4e3825';
    context.lineWidth = 4;
    context.beginPath();
    context.moveTo(anchor.x - 9, postTop + 14);
    context.lineTo(birdPos.x, birdPos.y);
    context.lineTo(anchor.x + 18, postTop + 14);
    context.stroke();
  }
}

function drawAimTrajectory(): void {
  if (phase !== 'aiming') {
    return;
  }
  const birdPos = scene.bird.body.getPosition();
  const velocity = calculateLaunchVelocity(scene.anchor, birdPos, LAUNCH_POWER, MAX_LAUNCH_SPEED);
  const gravity = GRAVITY_Y;

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

    if (hasRole(entity, ENTITY_ROLE.TARGET)) {
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

function renderHud(): void {
  scoreEl.textContent = String(score);
  targetsEl.textContent = String(countAliveTargets(scene));
  stateEl.textContent = phaseLabel(phase, result);
  roundMessageEl.textContent = phaseMessage(phase, result);
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
