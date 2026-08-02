import './styles/main.css';
import { GameApplication } from './core/GameApplication.js';

const extensionLoaders = import.meta.glob([
  './extensions/**/*.plugin.js',
  './world/**/*.plugin.js',
  './rendering/**/*.plugin.js',
  './combat/**/*.plugin.js',
  './ai/**/*.plugin.js',
  './gameplay/**/*.plugin.js',
  './ui/**/*.plugin.js',
  './audio/**/*.plugin.js',
]);

const dom = {
  canvas: document.querySelector('#game-canvas'),
  menu: document.querySelector('#game-menu'),
  menuMessage: document.querySelector('#menu-message'),
  enterButton: document.querySelector('#enter-game'),
  loadingStatus: document.querySelector('#loading-status'),
  stanceLabel: document.querySelector('#stance-label'),
  fatalError: document.querySelector('#fatal-error'),
};

try {
  const app = new GameApplication(dom);

  window.MedievalRPG = Object.freeze({
    app,
    getContext: () => app.context,
    registerExtension: (extension, name) => app.registerExtension(extension, name),
  });

  await app.initialize(extensionLoaders);
} catch (error) {
  console.error(error);
  dom.loadingStatus?.classList.add('loading-status--done');
  if (dom.fatalError) {
    dom.fatalError.hidden = false;
    dom.fatalError.textContent = [
      'THE ASHEN STANDARD COULD NOT START',
      '',
      error instanceof Error ? error.message : String(error),
      '',
      'A WebGL 2 capable browser is required.',
    ].join('\n');
  }
}
