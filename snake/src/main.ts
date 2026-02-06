import './style.css';
import {
  SPEED_BY_DIFFICULTY,
  advanceGame,
  createInitialState,
  queueDirection,
  restartGame,
  setDifficulty,
  setPhase,
} from './core/game';
import type { Difficulty, Direction, GamePhase, GameState, Point } from './core/types';

const BOARD = { cols: 22, rows: 22 };
const CELL_SIZE = 22;
const HIGH_SCORE_STORAGE_KEY = 'snake.high-score.v1';

const keyToDirection: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  a: 'left',
  s: 'down',
  d: 'right',
};

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Required element not found: ${selector}`);
  }
  return element;
}

const app = requireElement<HTMLDivElement>('#app');

app.innerHTML = `
  <main class="layout">
    <header class="hero">
      <p class="eyebrow">First Playable Prototype</p>
      <h1 class="title">Grid Snake</h1>
      <p class="subtitle">Arrow keys / WASD to move, Space to pause, Enter to start or restart.</p>
    </header>
    <section class="toolbar" aria-label="Game controls">
      <label class="control" for="difficulty">
        Difficulty
        <select id="difficulty" data-testid="difficulty">
          <option value="easy">Easy</option>
          <option value="normal" selected>Normal</option>
          <option value="hard">Hard</option>
        </select>
      </label>
      <button id="start-button" class="action-button" data-testid="start-button">Start</button>
      <button id="pause-button" class="action-button" data-testid="pause-button">Pause</button>
      <button id="restart-button" class="action-button" data-testid="restart-button">Restart</button>
    </section>
    <section class="hud" aria-live="polite">
      <p>Score <strong id="score" data-testid="score">0</strong></p>
      <p>Best <strong id="high-score" data-testid="high-score">0</strong></p>
      <p>Status <strong id="status" data-testid="status">Idle</strong></p>
      <p>Speed <strong id="speed" data-testid="speed">Normal</strong></p>
    </section>
    <section class="playfield">
      <canvas
        id="snake-canvas"
        data-testid="game-canvas"
        width="${BOARD.cols * CELL_SIZE}"
        height="${BOARD.rows * CELL_SIZE}"
      ></canvas>
      <p id="message" data-testid="message" class="message"></p>
    </section>
  </main>
`;

const difficultySelect = requireElement<HTMLSelectElement>('#difficulty');
const startButton = requireElement<HTMLButtonElement>('#start-button');
const pauseButton = requireElement<HTMLButtonElement>('#pause-button');
const restartButton = requireElement<HTMLButtonElement>('#restart-button');
const scoreValue = requireElement<HTMLElement>('#score');
const highScoreValue = requireElement<HTMLElement>('#high-score');
const statusValue = requireElement<HTMLElement>('#status');
const speedValue = requireElement<HTMLElement>('#speed');
const messageValue = requireElement<HTMLElement>('#message');
const canvas = requireElement<HTMLCanvasElement>('#snake-canvas');

const context2d = canvas.getContext('2d');
if (!context2d) {
  throw new Error('Could not create 2D canvas context.');
}
const context = context2d;

let highScore = readHighScore();
let state = createInitialState(BOARD, 'normal');
let gameLoopTimer: number | null = null;

render();

function readHighScore(): number {
  try {
    const value = window.localStorage.getItem(HIGH_SCORE_STORAGE_KEY);
    if (!value) {
      return 0;
    }
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

function persistHighScore(value: number): void {
  try {
    window.localStorage.setItem(HIGH_SCORE_STORAGE_KEY, String(value));
  } catch {
    // Ignore storage failures for environments without localStorage access.
  }
}

function titleCase(value: string): string {
  return `${value[0].toUpperCase()}${value.slice(1)}`;
}

function phaseLabel(phase: GamePhase): string {
  switch (phase) {
    case 'idle':
      return 'Idle';
    case 'running':
      return 'Running';
    case 'paused':
      return 'Paused';
    case 'game_over':
      return 'Game Over';
  }
}

function phaseMessage(currentState: GameState): string {
  switch (currentState.phase) {
    case 'idle':
      return 'Press Enter or Start to begin.';
    case 'running':
      return 'Stay calm and carve space before each turn.';
    case 'paused':
      return 'Paused. Press Space or Pause to continue.';
    case 'game_over':
      return 'Round over. Press Enter or Start to play again.';
  }
}

function drawCell(point: Point, fillStyle: string): void {
  context.fillStyle = fillStyle;
  context.fillRect(point.x * CELL_SIZE + 1, point.y * CELL_SIZE + 1, CELL_SIZE - 2, CELL_SIZE - 2);
}

function drawGame(currentState: GameState): void {
  context.fillStyle = '#111714';
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.strokeStyle = 'rgba(222, 246, 219, 0.08)';
  context.lineWidth = 1;
  for (let x = 0; x <= BOARD.cols; x += 1) {
    context.beginPath();
    context.moveTo(x * CELL_SIZE, 0);
    context.lineTo(x * CELL_SIZE, canvas.height);
    context.stroke();
  }
  for (let y = 0; y <= BOARD.rows; y += 1) {
    context.beginPath();
    context.moveTo(0, y * CELL_SIZE);
    context.lineTo(canvas.width, y * CELL_SIZE);
    context.stroke();
  }

  currentState.snake.forEach((segment, index) => {
    drawCell(segment, index === 0 ? '#70c17a' : '#4f9a58');
  });

  context.fillStyle = '#f66745';
  context.beginPath();
  context.arc(
    currentState.food.x * CELL_SIZE + CELL_SIZE / 2,
    currentState.food.y * CELL_SIZE + CELL_SIZE / 2,
    CELL_SIZE / 2.7,
    0,
    Math.PI * 2,
  );
  context.fill();
}

function stopGameLoop(): void {
  if (gameLoopTimer !== null) {
    window.clearInterval(gameLoopTimer);
    gameLoopTimer = null;
  }
}

function startGameLoop(): void {
  stopGameLoop();
  gameLoopTimer = window.setInterval(() => {
    step();
  }, SPEED_BY_DIFFICULTY[state.difficulty]);
}

function updateHighScoreIfNeeded(): void {
  if (state.score > highScore) {
    highScore = state.score;
    persistHighScore(highScore);
  }
}

function step(): void {
  const previousPhase = state.phase;
  state = advanceGame(state);
  if (state.phase === 'game_over' && previousPhase !== 'game_over') {
    updateHighScoreIfNeeded();
    stopGameLoop();
  }
  render();
}

function startOrResume(): void {
  if (state.phase === 'running') {
    return;
  }

  if (state.phase === 'game_over') {
    state = restartGame(state);
  }

  state = setPhase(state, 'running');
  startGameLoop();
  render();
}

function togglePause(): void {
  if (state.phase === 'running') {
    state = setPhase(state, 'paused');
    stopGameLoop();
    render();
    return;
  }
  if (state.phase === 'paused') {
    state = setPhase(state, 'running');
    startGameLoop();
    render();
  }
}

function resetToIdle(): void {
  state = restartGame(state);
  stopGameLoop();
  render();
}

function render(): void {
  drawGame(state);
  updateHighScoreIfNeeded();

  scoreValue.textContent = String(state.score);
  highScoreValue.textContent = String(highScore);
  statusValue.textContent = phaseLabel(state.phase);
  speedValue.textContent = titleCase(state.difficulty);
  messageValue.textContent = phaseMessage(state);

  difficultySelect.value = state.difficulty;
  startButton.textContent = state.phase === 'paused' ? 'Resume' : 'Start';
  pauseButton.textContent = state.phase === 'paused' ? 'Resume' : 'Pause';
  startButton.disabled = state.phase === 'running';
  pauseButton.disabled = state.phase === 'idle' || state.phase === 'game_over';
}

function onDirectionInput(direction: Direction): void {
  state = queueDirection(state, direction);
}

startButton.addEventListener('click', () => {
  startOrResume();
});

pauseButton.addEventListener('click', () => {
  togglePause();
});

restartButton.addEventListener('click', () => {
  resetToIdle();
});

difficultySelect.addEventListener('change', () => {
  const selectedDifficulty = difficultySelect.value as Difficulty;
  stopGameLoop();
  state = setDifficulty(state, selectedDifficulty);
  render();
});

window.addEventListener('keydown', (event) => {
  const normalizedKey = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  const direction = keyToDirection[normalizedKey];
  if (direction) {
    event.preventDefault();
    onDirectionInput(direction);
    return;
  }

  if (event.code === 'Space') {
    event.preventDefault();
    togglePause();
    return;
  }

  if (event.key === 'Enter') {
    event.preventDefault();
    startOrResume();
    return;
  }

  if (normalizedKey === 'r') {
    event.preventDefault();
    resetToIdle();
  }
});
