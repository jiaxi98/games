import {
  ACESFilmicToneMapping,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import { EventBus } from './EventBus.js';
import { ExtensionRegistry } from './ExtensionRegistry.js';
import { GameClock } from './GameClock.js';
import { GameState, GameStates } from './GameState.js';
import { SystemRegistry } from './SystemRegistry.js';
import { PerformanceMonitor } from './PerformanceMonitor.js';
import { createBootstrapEnvironment } from './BootstrapEnvironment.js';
import { InputManager } from '../input/InputManager.js';
import { CollisionWorld } from '../physics/CollisionWorld.js';
import { FirstPersonController } from '../player/FirstPersonController.js';

export class GameApplication {
  #animationFrame = null;
  #resizeObserver = null;
  #disposers = [];
  #destroyed = false;
  #fallbackEnvironment = null;

  constructor({
    canvas,
    menu,
    menuMessage,
    enterButton,
    loadingStatus,
    stanceLabel,
  }) {
    if (!canvas) throw new Error('GameApplication requires a canvas.');

    this.canvas = canvas;
    this.dom = { menu, menuMessage, enterButton, loadingStatus, stanceLabel };
    this.events = new EventBus();
    this.state = new GameState();
    this.clock = new GameClock();
    this.performance = new PerformanceMonitor();
    this.systems = new SystemRegistry();
    this.scene = new Scene();
    this.camera = new PerspectiveCamera(73, 1, 0.05, 650);
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.shadowMap.enabled = true;

    this.input = new InputManager({ pointerElement: canvas });
    this.physics = new CollisionWorld();
    this.player = new FirstPersonController({
      camera: this.camera,
      input: this.input,
      collisionWorld: this.physics,
      spawn: new Vector3(0, 0.01, 10),
    });
    this.frameAlpha = 0;
    const app = this;

    this.context = Object.freeze({
      app: this,
      scene: this.scene,
      camera: this.camera,
      renderer: this.renderer,
      canvas: this.canvas,
      input: this.input,
      physics: this.physics,
      player: this.player,
      state: this.state,
      events: this.events,
      performance: this.performance,
      get frameAlpha() {
        return app.frameAlpha;
      },
      registerSystem: (system, options) => this.systems.add(system, options),
      registerCollider: (...args) => this.physics.addAABB(...args),
      registerBoxCollider: (...args) => this.physics.addBox(...args),
      setGroundHeightProvider: (provider) => this.physics.setGroundHeightProvider(provider),
      setSpawn: (position, rotation) => this.player.teleport(position, rotation),
      removeFallbackEnvironment: () => this.removeFallbackEnvironment(),
    });
    this.extensions = new ExtensionRegistry(this.context);

    this.onFrame = this.onFrame.bind(this);
    this.onResize = this.onResize.bind(this);
    this.onVisibilityChange = this.onVisibilityChange.bind(this);
  }

  async initialize(extensionLoaders = {}) {
    this.input.connect();
    this.systems.add(this.player, { priority: -100, name: 'player' });
    this.#fallbackEnvironment = createBootstrapEnvironment(this.context);
    this.#connectFlow();
    this.onResize();

    const entries = Object.entries(extensionLoaders);
    const results = await Promise.allSettled(
      entries.map(async ([path, load]) => {
        const extension = await load();
        return this.extensions.install(extension, path);
      }),
    );

    for (const result of results) {
      if (result.status === 'rejected') {
        console.error('[extensions] Failed to install an extension.', result.reason);
      }
    }

    const queued = window.__MEDIEVAL_RPG_EXTENSIONS__ ?? [];
    for (const extension of queued.splice(0)) {
      await this.extensions.install(extension);
    }
    window.__MEDIEVAL_RPG_EXTENSIONS__ = queued;
    window.__MEDIEVAL_RPG_REGISTER_EXTENSION__ = (extension, name) => (
      this.registerExtension(extension, name)
    );
    this.#disposers.push(() => {
      delete window.__MEDIEVAL_RPG_REGISTER_EXTENSION__;
    });

    this.state.transition(GameStates.READY);
    this.dom.loadingStatus?.classList.add('loading-status--done');
    this.#animationFrame = requestAnimationFrame(this.onFrame);
    this.events.emit('ready', this.context);
    window.dispatchEvent(new CustomEvent('medieval-rpg:ready', { detail: this.context }));
    window.dispatchEvent(new CustomEvent('ashen-standard:ready', { detail: this.context }));
    return this.context;
  }

  async registerExtension(extension, name) {
    return this.extensions.install(extension, name);
  }

  removeFallbackEnvironment() {
    if (!this.#fallbackEnvironment) return;
    this.#fallbackEnvironment.dispose();
    this.#fallbackEnvironment = null;
    this.events.emit('environment:fallback-removed');
  }

  onFrame(timeMs) {
    if (this.#destroyed) return;
    this.#animationFrame = requestAnimationFrame(this.onFrame);
    this.performance.begin(timeMs);
    const frame = this.clock.tick(timeMs);
    this.frameAlpha = frame.alpha;

    try {
      if (this.state.isPlaying) {
        this.systems.run('update', frame.delta, this.context);
        for (let index = 0; index < frame.steps; index += 1) {
          this.systems.run('fixedUpdate', this.clock.fixedStep, this.context);
        }
        this.systems.run('lateUpdate', frame.delta, this.context);
      }

      this.systems.run('render', this.renderer, this.scene, this.camera, this.context);
      this.renderer.render(this.scene, this.camera);
      this.input.endFrame();
      this.#updateStatus();
    } catch (error) {
      this.fail(error);
    }
  }

  onResize() {
    const width = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    const height = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    this.systems.run('resize', { width, height, pixelRatio }, this.context);
    this.events.emit('resize', { width, height, pixelRatio });
  }

  pause(reason = 'manual') {
    if (!this.state.isPlaying) return;
    this.state.transition(GameStates.PAUSED, { reason });
    this.input.clear();
  }

  fail(error) {
    console.error(error);
    if (this.state.canTransition(GameStates.ERROR)) {
      this.state.transition(GameStates.ERROR, { error });
    }
    this.input.exitPointerLock();
    this.events.emit('error', error);
  }

  destroy() {
    if (this.#destroyed) return;
    this.#destroyed = true;
    if (this.#animationFrame !== null) cancelAnimationFrame(this.#animationFrame);
    this.#resizeObserver?.disconnect();
    for (const dispose of this.#disposers.splice(0).reverse()) dispose();
    this.extensions.dispose();
    this.systems.dispose();
    this.removeFallbackEnvironment();
    this.input.disconnect();
    this.renderer.dispose();
    this.events.clear();
    if (this.state.canTransition(GameStates.STOPPED)) {
      this.state.transition(GameStates.STOPPED);
    }
  }

  #connectFlow() {
    const start = () => this.input.requestPointerLock();
    const startFromCanvas = () => {
      if (!this.state.isPlaying) start();
    };
    this.dom.enterButton?.addEventListener('click', start);
    this.canvas.addEventListener('click', startFromCanvas);
    this.#disposers.push(() => this.dom.enterButton?.removeEventListener('click', start));
    this.#disposers.push(() => this.canvas.removeEventListener('click', startFromCanvas));

    this.#disposers.push(this.input.on('pointerlock:change', ({ locked }) => {
      if (locked && (this.state.value === GameStates.READY || this.state.value === GameStates.PAUSED)) {
        this.clock.reset(performance.now());
        this.state.transition(GameStates.PLAYING);
      } else if (!locked && this.state.isPlaying) {
        this.pause('pointer-lock-released');
      }
    }));

    this.#disposers.push(this.state.onChange(({ current }) => {
      document.querySelector('#game')?.classList.toggle(
        'game--playing',
        current === GameStates.PLAYING,
      );

      if (current === GameStates.PAUSED) {
        if (this.dom.menuMessage) {
          this.dom.menuMessage.textContent = 'The fight at Saint-Orens Ford waits for your return.';
        }
        if (this.dom.enterButton) this.dom.enterButton.textContent = 'Return to the battle';
      } else if (current === GameStates.ERROR) {
        if (this.dom.menuMessage) this.dom.menuMessage.textContent = 'The field could not be mustered.';
      }

      this.events.emit('state:change', current);
    }));

    window.addEventListener('resize', this.onResize);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.#disposers.push(() => window.removeEventListener('resize', this.onResize));
    this.#disposers.push(() => document.removeEventListener('visibilitychange', this.onVisibilityChange));

    if ('ResizeObserver' in window) {
      this.#resizeObserver = new ResizeObserver(this.onResize);
      this.#resizeObserver.observe(this.canvas);
    }
  }

  onVisibilityChange() {
    if (document.hidden && this.state.isPlaying) {
      this.input.exitPointerLock();
      this.pause('document-hidden');
    }
  }

  #updateStatus() {
    if (!this.dom.stanceLabel) return;
    const speed = Math.hypot(this.player.velocity.x, this.player.velocity.z);
    this.dom.stanceLabel.textContent = this.player.crouching
      ? 'CROUCHED'
      : speed > this.player.config.walkSpeed + 0.5
        ? 'SPRINTING'
        : this.player.grounded
          ? 'READY'
          : 'AIRBORNE';
  }

  getPerformanceSnapshot() {
    return this.performance.sample(this.renderer);
  }
}
