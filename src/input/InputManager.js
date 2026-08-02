import { EventBus } from '../core/EventBus.js';

const DEFAULT_BINDINGS = Object.freeze({
  forward: ['KeyW', 'ArrowUp'],
  backward: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['Space'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  crouch: ['KeyC', 'ControlLeft', 'ControlRight'],
  interact: ['KeyE'],
  attack: ['Mouse0'],
  guard: ['Mouse2'],
});

export class InputManager {
  #target;
  #pointerElement;
  #bindings;
  #events = new EventBus();
  #keysDown = new Set();
  #pressed = new Set();
  #released = new Set();
  #mouseDown = new Set();
  #lookX = 0;
  #lookY = 0;
  #connected = false;

  constructor({
    target = window,
    pointerElement,
    bindings = DEFAULT_BINDINGS,
  } = {}) {
    this.#target = target;
    this.#pointerElement = pointerElement;
    this.#bindings = bindings;

    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
    this.onMouseDown = this.onMouseDown.bind(this);
    this.onMouseUp = this.onMouseUp.bind(this);
    this.onMouseMove = this.onMouseMove.bind(this);
    this.onContextMenu = this.onContextMenu.bind(this);
    this.onPointerLockChange = this.onPointerLockChange.bind(this);
    this.onBlur = this.onBlur.bind(this);
  }

  get pointerLocked() {
    return document.pointerLockElement === this.#pointerElement;
  }

  connect() {
    if (this.#connected) return;
    this.#connected = true;
    this.#target.addEventListener('keydown', this.onKeyDown);
    this.#target.addEventListener('keyup', this.onKeyUp);
    this.#target.addEventListener('mousedown', this.onMouseDown);
    this.#target.addEventListener('mouseup', this.onMouseUp);
    this.#target.addEventListener('mousemove', this.onMouseMove);
    this.#target.addEventListener('blur', this.onBlur);
    this.#pointerElement.addEventListener('contextmenu', this.onContextMenu);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    document.addEventListener('pointerlockerror', this.onPointerLockChange);
  }

  disconnect() {
    if (!this.#connected) return;
    this.#connected = false;
    this.#target.removeEventListener('keydown', this.onKeyDown);
    this.#target.removeEventListener('keyup', this.onKeyUp);
    this.#target.removeEventListener('mousedown', this.onMouseDown);
    this.#target.removeEventListener('mouseup', this.onMouseUp);
    this.#target.removeEventListener('mousemove', this.onMouseMove);
    this.#target.removeEventListener('blur', this.onBlur);
    this.#pointerElement.removeEventListener('contextmenu', this.onContextMenu);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    document.removeEventListener('pointerlockerror', this.onPointerLockChange);
    this.clear();
  }

  async requestPointerLock() {
    if (this.pointerLocked) return true;
    try {
      await this.#pointerElement.requestPointerLock({ unadjustedMovement: true });
    } catch {
      try {
        await this.#pointerElement.requestPointerLock();
      } catch (error) {
        this.#events.emit('pointerlock:error', error);
        return false;
      }
    }
    return this.pointerLocked;
  }

  exitPointerLock() {
    if (this.pointerLocked) document.exitPointerLock();
  }

  on(type, listener) {
    return this.#events.on(type, listener);
  }

  isDown(action) {
    return this.#codesFor(action).some((code) => (
      code.startsWith('Mouse')
        ? this.#mouseDown.has(Number(code.slice(5)))
        : this.#keysDown.has(code)
    ));
  }

  wasPressed(action) {
    return this.#codesFor(action).some((code) => this.#pressed.has(code));
  }

  wasReleased(action) {
    return this.#codesFor(action).some((code) => this.#released.has(code));
  }

  getMovementAxes() {
    const x = Number(this.isDown('right')) - Number(this.isDown('left'));
    const y = Number(this.isDown('forward')) - Number(this.isDown('backward'));
    const length = Math.hypot(x, y);
    return length > 1 ? { x: x / length, y: y / length } : { x, y };
  }

  consumeLookDelta() {
    const delta = { x: this.#lookX, y: this.#lookY };
    this.#lookX = 0;
    this.#lookY = 0;
    return delta;
  }

  endFrame() {
    this.#pressed.clear();
    this.#released.clear();
  }

  clear() {
    for (const code of this.#keysDown) this.#released.add(code);
    for (const button of this.#mouseDown) this.#released.add(`Mouse${button}`);
    this.#keysDown.clear();
    this.#mouseDown.clear();
    this.#lookX = 0;
    this.#lookY = 0;
  }

  onKeyDown(event) {
    if (!this.#keysDown.has(event.code)) this.#pressed.add(event.code);
    this.#keysDown.add(event.code);

    if (this.pointerLocked && this.#isBoundCode(event.code)) {
      event.preventDefault();
    }
  }

  onKeyUp(event) {
    this.#keysDown.delete(event.code);
    this.#released.add(event.code);
  }

  onMouseDown(event) {
    if (!this.pointerLocked) return;
    const code = `Mouse${event.button}`;
    if (!this.#mouseDown.has(event.button)) this.#pressed.add(code);
    this.#mouseDown.add(event.button);
  }

  onMouseUp(event) {
    this.#mouseDown.delete(event.button);
    this.#released.add(`Mouse${event.button}`);
  }

  onMouseMove(event) {
    if (!this.pointerLocked) return;
    this.#lookX += event.movementX ?? 0;
    this.#lookY += event.movementY ?? 0;
  }

  onContextMenu(event) {
    event.preventDefault();
  }

  onPointerLockChange() {
    const locked = this.pointerLocked;
    if (!locked) this.clear();
    this.#events.emit('pointerlock:change', { locked });
  }

  onBlur() {
    this.clear();
  }

  #codesFor(action) {
    return this.#bindings[action] ?? [];
  }

  #isBoundCode(code) {
    return Object.values(this.#bindings).some((codes) => codes.includes(code));
  }
}

export { DEFAULT_BINDINGS };
