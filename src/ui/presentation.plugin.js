import { createAudioSystem } from '../audio/audioSystem.js';
import { createNarrativeDirector } from '../narrative/director.js';
import { CAMPAIGN } from '../narrative/campaign.js';
import { createHUD } from './hud.js';

const EVENT_ALIASES = Object.freeze([
  'health',
  'player:health',
  'stamina',
  'player:stamina',
  'objective:set',
  'objective:progress',
  'objective:complete',
  'battle:status',
  'battle:phase',
  'battlefield:cohesion',
  'battlefield:reversal',
  'battlefield:casualty',
  'battlefield:ai-impact',
  'battlefield:rout',
  'interaction',
  'reticle',
  'encounter:captain',
  'tutorial',
  'commands',
  'command:issued',
  'announcement',
  'subtitle',
  'combat:swing',
  'weapon:whoosh',
  'combat:impact',
  'combat:kill',
  'kill',
  'damage',
  'player:damage',
  'player:defense',
  'player:second-wind',
  'footstep',
  'player:footstep',
  'armor',
  'player:armor',
  'player:evade',
  'combat:exhausted',
  'player:exhausted',
  'exhaustion',
  'mission:start',
  'mission:complete',
  'mission:fail',
  'victory',
  'death',
  'pause',
  'resume',
]);

export const name = 'presentation-feedback';

export function install(context) {
  const hud = createHUD({ campaign: CAMPAIGN, showStart: false });
  const audio = createAudioSystem();
  const narrative = createNarrativeDirector({ campaign: CAMPAIGN });
  const disposers = [];
  let priorPlaying = context.state.isPlaying;
  let stepDistance = 0;
  let previousX = context.player.position.x;
  let previousZ = context.player.position.z;
  let firstPlay = true;
  let battleStatusTimer = 0;
  let terminalState = false;
  let interactionReticle = false;
  let exhaustedLastFrame = false;
  const shellMenu = globalThis.document?.querySelector?.('#game-menu');
  const shellHUD = globalThis.document?.querySelector?.('#game-hud');
  const shellHUDDisplay = shellHUD?.style.display ?? '';
  if (shellHUD) {
    shellHUD.hidden = true;
    shellHUD.style.display = 'none';
  }

  const forward = { x: 0, y: 0, z: -1 };
  const up = { x: 0, y: 1, z: 0 };

  context.app.presentation = Object.freeze({ hud, audio, narrative });
  narrative.connectHUD(hud);
  disposers.push(audio.connect(narrative));

  for (const type of EVENT_ALIASES) {
    disposers.push(context.events.on(type, (detail = {}) => {
      if (type === 'interaction') {
        interactionReticle = detail?.visible !== false && Boolean(detail?.label);
      } else if (type === 'reticle') {
        interactionReticle = detail?.state === 'interact';
      }
      if (type.startsWith('objective:') || type.startsWith('battle:') || type.startsWith('mission:')) {
        narrative.handleEvent(type, detail);
      } else {
        hud.handleEvent(type, detail);
        audio.handleEvent(type, detail);
      }
    }));
  }

  disposers.push(context.events.on('state:change', (state) => {
    const playing = state === 'playing';
    if (playing && !priorPlaying) {
      if (terminalState) {
        priorPlaying = playing;
        return;
      }
      if (shellMenu) shellMenu.hidden = true;
      hud.hidePanel();
      audio.resume();
      audio.handleEvent('resume');
      if (firstPlay) {
        firstPlay = false;
        narrative.startMission({
          announce: false,
          setObjective: false,
          bark: false,
        });
      }
    } else if (!playing && priorPlaying && state === 'paused' && !terminalState) {
      hud.showPause();
      audio.handleEvent('pause');
    }
    priorPlaying = playing;
  }));

  const lockTerminalPanel = () => {
    terminalState = true;
  };
  disposers.push(context.events.on('victory', lockTerminalPanel));
  disposers.push(context.events.on('mission:complete', lockTerminalPanel));
  disposers.push(context.events.on('death', lockTerminalPanel));
  disposers.push(context.events.on('mission:fail', lockTerminalPanel));

  disposers.push(hud.on('action:resume', () => {
    if (terminalState) return;
    context.input.requestPointerLock();
  }));
  disposers.push(hud.on('action:start', () => {
    context.input.requestPointerLock();
  }));
  disposers.push(hud.on('action:restart', () => {
    context.events.emit('mission:restart');
    globalThis.location?.reload?.();
  }));

  // The shell owns its opening menu. Once play begins this module owns pause,
  // mission, death and victory presentation.
  hud.root.dataset.mode = 'game';

  return {
    name,
    update(delta) {
      narrative.update(delta);

      const player = context.player;
      const dx = player.position.x - previousX;
      const dz = player.position.z - previousZ;
      previousX = player.position.x;
      previousZ = player.position.z;
      const planarSpeed = Math.hypot(player.velocity.x, player.velocity.z);

      if (player.grounded) {
        stepDistance += Math.hypot(dx, dz);
        const stride = planarSpeed > 5.4 ? 1.5 : 1.85;
        if (stepDistance >= stride) {
          stepDistance %= stride;
          audio.footstep({ material: 'mud', volume: planarSpeed > 5.4 ? 0.3 : 0.22 });
        }
      } else {
        stepDistance = 0;
      }

      const yaw = player.yaw;
      const pitch = player.pitch;
      forward.x = -Math.sin(yaw) * Math.cos(pitch);
      forward.y = Math.sin(pitch);
      forward.z = -Math.cos(yaw) * Math.cos(pitch);
      audio.update(delta, {
        listener: {
          position: context.camera.position,
          forward,
          up,
        },
        movement: Math.min(1.25, planarSpeed / Math.max(1, player.config.sprintSpeed)),
      });

      const combat = context.app.playerCombat?.getSnapshot?.();
      if (combat) {
        hud.setHealth(combat.health, combat.maxHealth);
        hud.setStamina(combat.stamina, combat.maxStamina);
        const exhausted = combat.stamina <= Math.max(4, combat.maxStamina * 0.04);
        if (exhausted && !exhaustedLastFrame) {
          audio.handleEvent('player:exhausted', {
            stamina: combat.stamina,
            maxStamina: combat.maxStamina,
          });
        }
        exhaustedLastFrame = exhausted;
        if (!interactionReticle) {
          hud.setReticle(combat.weaponState === 'blocking' ? 'guard' : 'default');
        }
      }

      battleStatusTimer -= delta;
      if (battleStatusTimer <= 0) {
        const battle = context.app.battlefield?.getState?.();
        if (battle?.factions) {
          const allied = battle.factions.get?.(1);
          const enemy = battle.factions.get?.(2);
          if (allied || enemy) {
            const alliedState = battle.squads?.find?.((squad) => squad.factionId === 1)?.cohesion?.state;
            const enemyState = battle.squads?.find?.((squad) => squad.factionId === 2)?.cohesion?.state;
            hud.setBattleStatus({
              allied: {
                cohesion: allied?.morale ?? 0,
                state: alliedState ?? 'pressured',
              },
              enemy: {
                cohesion: enemy?.morale ?? 0,
                state: enemyState ?? 'ordered',
              },
            });
          }
        }
        battleStatusTimer = 0.25;
      }
    },
    dispose() {
      delete context.app.presentation;
      if (shellMenu) shellMenu.hidden = false;
      if (shellHUD) {
        shellHUD.hidden = true;
        shellHUD.style.display = shellHUDDisplay;
      }
      for (const dispose of disposers.splice(0).reverse()) dispose?.();
      narrative.dispose();
      hud.dispose();
      void audio.dispose();
    },
  };
}

export default { name, install };
