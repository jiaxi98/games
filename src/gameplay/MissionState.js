export const MissionStage = Object.freeze({
  RECOVER: 'recover',
  RALLY: 'rally',
  BREAK: 'break',
  CAPTAIN: 'captain',
  VICTORY: 'victory',
  WON: 'won',
  DEAD: 'dead',
});

const ORDERED_STAGES = Object.freeze([
  MissionStage.RECOVER,
  MissionStage.RALLY,
  MissionStage.BREAK,
  MissionStage.CAPTAIN,
  MissionStage.VICTORY,
]);

const DEFAULT_CONFIG = Object.freeze({
  rallyRequired: 3,
  breakRequired: 5,
  rallyStableSeconds: 6,
  routedBreakSeconds: 3,
});

export class MissionState {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.reset();
  }

  reset() {
    this.stage = MissionStage.RECOVER;
    this.previousStage = null;
    this.standardRecovered = false;
    this.rallyProgress = 0;
    this.breakProgress = 0;
    this.rallyCommands = 0;
    this.braceCommands = 0;
    this.advanceCommands = 0;
    this.kills = 0;
    this.captainDefeated = false;
    this.rallyStableTime = 0;
    this.enemyRoutedTime = 0;
    this.failedAt = null;
    return this.snapshot();
  }

  recoverStandard() {
    if (this.stage !== MissionStage.RECOVER) return null;
    this.standardRecovered = true;
    return this.#transition(MissionStage.RALLY, 'standard-recovered');
  }

  command(command, {
    nearRally = false,
    nearSpearLine = false,
    affected = 0,
  } = {}) {
    if (this.stage === MissionStage.RALLY && command === 'rally') {
      this.rallyCommands += 1;
      if (nearRally && affected > 0) {
        this.rallyProgress = Math.min(
          this.config.rallyRequired,
          this.rallyProgress + 1,
        );
      }
      return this.#checkRally('rally-command');
    }

    if (this.stage === MissionStage.BREAK && command === 'brace') {
      this.braceCommands += 1;
      if (nearSpearLine && affected > 0) {
        this.breakProgress = Math.min(
          this.config.breakRequired,
          this.breakProgress + 0.75,
        );
      }
      return this.#checkBreak('brace-command');
    }

    if (this.stage === MissionStage.BREAK && command === 'advance') {
      this.advanceCommands += 1;
      if (nearSpearLine && affected > 0) {
        const coordinatedBonus = this.braceCommands > 0 ? 1.5 : 0.75;
        this.breakProgress = Math.min(
          this.config.breakRequired,
          this.breakProgress + coordinatedBonus,
        );
      }
      return this.#checkBreak('advance-command');
    }

    return null;
  }

  recordKill({ nearRally = false, nearSpearLine = false, captain = false } = {}) {
    this.kills += 1;
    if (captain) return this.defeatCaptain();

    if (this.stage === MissionStage.RALLY && nearRally) {
      this.rallyProgress = Math.min(
        this.config.rallyRequired,
        this.rallyProgress + 1,
      );
      return this.#checkRally('hedgerow-defended');
    }

    if (this.stage === MissionStage.BREAK && nearSpearLine) {
      this.breakProgress = Math.min(
        this.config.breakRequired,
        this.breakProgress + 1,
      );
      return this.#checkBreak('spear-line-casualty');
    }

    return null;
  }

  update({
    delta = 0,
    nearRally = false,
    alliedMorale = 0,
    alliedAlive = 0,
    enemyMorale = 1,
    enemyAlive = Infinity,
    enemyRouted = false,
    captainAlive = true,
  } = {}) {
    if (this.stage === MissionStage.RALLY) {
      const holding = nearRally && alliedAlive > 0 && alliedMorale >= 0.45;
      this.rallyStableTime = holding
        ? this.rallyStableTime + Math.max(0, delta)
        : Math.max(0, this.rallyStableTime - Math.max(0, delta) * 0.5);
      if (this.rallyStableTime >= this.config.rallyStableSeconds) {
        this.rallyProgress = this.config.rallyRequired;
        return this.#transition(MissionStage.BREAK, 'hedgerow-held');
      }
      return null;
    }

    if (this.stage === MissionStage.BREAK) {
      const lineFailing = enemyRouted || enemyMorale <= 0.34 || enemyAlive <= 5;
      this.enemyRoutedTime = lineFailing
        ? this.enemyRoutedTime + Math.max(0, delta)
        : Math.max(0, this.enemyRoutedTime - Math.max(0, delta));
      if (this.enemyRoutedTime >= this.config.routedBreakSeconds) {
        this.breakProgress = this.config.breakRequired;
        return this.#transition(MissionStage.CAPTAIN, 'spear-line-broken');
      }
      return this.#checkBreak('battle-pressure');
    }

    if (
      this.stage === MissionStage.CAPTAIN
      && !captainAlive
    ) {
      return this.defeatCaptain();
    }

    return null;
  }

  defeatCaptain() {
    if (this.stage !== MissionStage.CAPTAIN || this.captainDefeated) return null;
    this.captainDefeated = true;
    return this.#transition(MissionStage.VICTORY, 'captain-defeated');
  }

  secureBridge({ nearBridge = false, interacted = false } = {}) {
    if (
      this.stage !== MissionStage.VICTORY
      || !nearBridge
      || !interacted
    ) return null;
    return this.#transition(MissionStage.WON, 'bridge-secured');
  }

  die() {
    if (this.stage === MissionStage.WON || this.stage === MissionStage.DEAD) return null;
    this.failedAt = this.stage;
    return this.#transition(MissionStage.DEAD, 'player-killed');
  }

  get progress() {
    if (this.stage === MissionStage.RECOVER) return 0;
    if (this.stage === MissionStage.RALLY) {
      const commandProgress = this.rallyProgress / this.config.rallyRequired;
      const holdProgress = this.rallyStableTime / this.config.rallyStableSeconds;
      return clamp01(Math.max(commandProgress, holdProgress));
    }
    if (this.stage === MissionStage.BREAK) {
      const actionProgress = this.breakProgress / this.config.breakRequired;
      const routProgress = this.enemyRoutedTime / this.config.routedBreakSeconds;
      return clamp01(Math.max(actionProgress, routProgress));
    }
    if (this.stage === MissionStage.CAPTAIN) return this.captainDefeated ? 1 : 0;
    if (this.stage === MissionStage.VICTORY) return 0;
    if (this.stage === MissionStage.WON) return 1;
    return 0;
  }

  snapshot() {
    return {
      stage: this.stage,
      previousStage: this.previousStage,
      standardRecovered: this.standardRecovered,
      rallyProgress: this.rallyProgress,
      breakProgress: this.breakProgress,
      rallyCommands: this.rallyCommands,
      braceCommands: this.braceCommands,
      advanceCommands: this.advanceCommands,
      kills: this.kills,
      captainDefeated: this.captainDefeated,
      failedAt: this.failedAt,
      progress: this.progress,
    };
  }

  #checkRally(reason) {
    if (this.rallyProgress < this.config.rallyRequired) return null;
    return this.#transition(MissionStage.BREAK, reason);
  }

  #checkBreak(reason) {
    if (this.breakProgress < this.config.breakRequired) return null;
    return this.#transition(MissionStage.CAPTAIN, reason);
  }

  #transition(next, reason) {
    const currentIndex = ORDERED_STAGES.indexOf(this.stage);
    const nextIndex = ORDERED_STAGES.indexOf(next);
    const terminal = next === MissionStage.WON || next === MissionStage.DEAD;
    if (!terminal && nextIndex !== currentIndex + 1) return null;

    const previous = this.stage;
    this.previousStage = previous;
    this.stage = next;
    return {
      previous,
      current: next,
      reason,
      snapshot: this.snapshot(),
    };
  }
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}
