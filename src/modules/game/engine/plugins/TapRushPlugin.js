'use strict';

const GamePlugin = require('../GamePlugin');

const GAME_DURATION_SECONDS = 20;
const MAX_PLAUSIBLE_TAPS = 100;
const MIN_DURATION = 18;
const MAX_DURATION = 28;

/**
 * Tap Rush Plugin — ported to new architecture.
 *
 * canPlayerAct: anyone can tap (simultaneous)
 * getTimers: returns game timer from config
 */
class TapRushPlugin extends GamePlugin {
  static EXECUTION_MODEL = 'simultaneous';

  constructor(matchData) {
    super(matchData);
    this.players = matchData.players || [];
    this.gameMetadata = matchData.metadata || {};
  }

  canPlayerAct(state, userId) {
    // Simultaneous: anyone can tap
    return true;
  }

  getTimers(state) {
    const config = this.configSnapshot || {};
    const gameDurationMs = (config.gameDurationSeconds || GAME_DURATION_SECONDS) * 1000;

    return [{
      type: 'game',
      durationMs: gameDurationMs,
      jobData: { gameSlug: 'tap-rush' },
    }];
  }

  getCommandTimeoutMs() {
    return 200;
  }

  _generateTargetSequence(seed, count = 15) {
    const crypto = require('crypto');
    const targets = [];
    const totalBudget = (GAME_DURATION_SECONDS - 2) * 1000;
    const base = Math.floor(totalBudget / count);
    let acc = 0;
    for (let i = 0; i < count; i++) {
      const hash = crypto
        .createHmac('sha256', seed)
        .update(i.toString())
        .digest('hex');
      const jitter = (parseInt(hash.slice(4, 6), 16) % 400) - 200;
      acc = Math.max(250, acc + base + jitter);
      targets.push({
        seq: i,
        x: parseInt(hash.slice(0, 2), 16) % 100,
        y: parseInt(hash.slice(2, 4), 16) % 100,
        delay: acc,
      });
    }
    return targets;
  }

  createState() {
    const crypto = require('crypto');
    const seed = crypto.randomBytes(16).toString('hex');
    const scores = {};
    this.players.forEach(p => { scores[p.userId] = 0; });

    return {
      seed,
      targetSequence: this._generateTargetSequence(seed),
      scores,
      tapLogs: {},
      startedAt: null,
      finishedAt: null,
      status: 'active',
      winner: null,
    };
  }

  onPlayerJoin(userId) {}
  onPlayerLeave(userId) {}
  onReconnect(userId) {}
  cleanup() {}

  validateMove(userId, moveData, currentState) {
    if (moveData.type !== 'TAP') {
      return { valid: false, reason: 'Unknown move type' };
    }

    const { seq } = moveData;
    const userTaps = currentState.tapLogs[userId] || [];
    const currentScore = currentState.scores[userId] || 0;

    if (currentScore >= MAX_PLAUSIBLE_TAPS) {
      return { valid: false, reason: 'Score ceiling reached' };
    }

    if (userTaps.some(t => t.seq === seq)) {
      return { valid: false, reason: 'Duplicate tap' };
    }

    if (!currentState.targetSequence[seq]) {
      return { valid: false, reason: 'Invalid target sequence' };
    }

    return { valid: true };
  }

  applyMove(userId, moveData, currentState) {
    const { seq, clientTs } = moveData;

    const newTapLogs = {
      ...currentState.tapLogs,
      [userId]: [...(currentState.tapLogs[userId] || []), { seq, ts: clientTs || Date.now() }],
    };

    const newScores = {
      ...currentState.scores,
      [userId]: (currentState.scores[userId] || 0) + 1,
    };

    return { ...currentState, scores: newScores, tapLogs: newTapLogs };
  }

  finalize(userId, reportedScore, durationSeconds, currentState) {
    const actualScore = currentState.scores[userId] || 0;
    const maxXp = this.gameMetadata.maxXp || 35;

    if (durationSeconds < MIN_DURATION || durationSeconds > MAX_DURATION) {
      throw new Error('Invalid game duration');
    }

    const xpEarned = Math.min(maxXp, actualScore > 0 ? 10 + Math.floor((actualScore * maxXp) / 28) : 0);

    return {
      score: actualScore,
      duration: durationSeconds,
      result: actualScore >= 1 ? 'WIN' : 'LOSS',
      xpEarned,
    };
  }

  isFinished(currentState) {
    return currentState.status === 'finished';
  }

  calculateReward(currentState, userId) {
    const score = currentState.scores[userId] || 0;
    const maxXp = this.gameMetadata.maxXp || 35;
    const xpEarned = Math.min(maxXp, score > 0 ? 10 + Math.floor((score * maxXp) / 28) : 0);
    return {
      result: score >= 1 ? 'WIN' : 'LOSS',
      xpEarned,
    };
  }

  getInitialPlayerPayload(currentState) {
    return {
      targetSequence: currentState.targetSequence,
      durationSeconds: GAME_DURATION_SECONDS,
    };
  }

  getSpectatorState(currentState) {
    const { seed, ...safe } = currentState;
    return safe;
  }
}

module.exports = TapRushPlugin;
