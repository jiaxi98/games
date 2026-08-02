import { EventBus } from './EventBus.js';

export const GameStates = Object.freeze({
  BOOTING: 'booting',
  READY: 'ready',
  PLAYING: 'playing',
  PAUSED: 'paused',
  STOPPED: 'stopped',
  ERROR: 'error',
});

const allowedTransitions = {
  [GameStates.BOOTING]: new Set([GameStates.READY, GameStates.ERROR, GameStates.STOPPED]),
  [GameStates.READY]: new Set([GameStates.PLAYING, GameStates.STOPPED, GameStates.ERROR]),
  [GameStates.PLAYING]: new Set([GameStates.PAUSED, GameStates.STOPPED, GameStates.ERROR]),
  [GameStates.PAUSED]: new Set([GameStates.PLAYING, GameStates.STOPPED, GameStates.ERROR]),
  [GameStates.STOPPED]: new Set(),
  [GameStates.ERROR]: new Set([GameStates.STOPPED]),
};

export class GameState {
  #state = GameStates.BOOTING;
  #events = new EventBus();

  get value() {
    return this.#state;
  }

  get isPlaying() {
    return this.#state === GameStates.PLAYING;
  }

  canTransition(nextState) {
    return allowedTransitions[this.#state]?.has(nextState) ?? false;
  }

  transition(nextState, detail = undefined) {
    if (nextState === this.#state) return false;
    if (!this.canTransition(nextState)) {
      throw new Error(`Invalid game state transition: ${this.#state} → ${nextState}`);
    }

    const previous = this.#state;
    this.#state = nextState;
    this.#events.emit('change', { previous, current: nextState, detail });
    return true;
  }

  onChange(listener) {
    return this.#events.on('change', listener);
  }
}
