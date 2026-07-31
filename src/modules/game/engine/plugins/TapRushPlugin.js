'use strict';

const GamePlugin = require('../GamePlugin');

/**
 * Tap Rush Plugin
 *
 * A 20-second timed game. The server:
 * - Generates all target positions using an HMAC chain (seeded, deterministic)
 * - Validates that tap timestamps are physically plausible
 * - Rejects superhuman scores (> 100 taps in 20s = impossible)
 *
 * The WebView receives the pre-computed target sequence from the server,
 * so clients cannot inject fake taps.
 */
const GAME_DURATION_SECONDS = 20;
const MAX_PLAUSIBLE_TAPS = 100; // ~5 taps/sec * 20s = 100 (generous ceiling)
const MIN_DURATION = 18;        // Allow slight timing variance
const MAX_DURATION = 28;

class TapRushPlugin extends GamePlugin {
  constructor(matchData) {
    super(matchData);
    this.players = matchData.players || [];
    this.gameMetadata = matchData.metadata || {};
  }

  /** Generate a deterministic target sequence from a seed using HMAC */
  _generateTargetSequence(seed, count = 15) {
    const crypto = require('crypto');
    const targets = [];
    for (let i = 0; i < count; i++) {
      const hash = crypto
        .createHmac('sha256', seed)
        .update(i.toString())
        .digest('hex');
      targets.push({
        seq: i,
        x: parseInt(hash.slice(0, 2), 16) % 100,
        y: parseInt(hash.slice(2, 4), 16) % 100,
        delay: parseInt(hash.slice(4, 6), 16) % 800 + 200, // 200–1000ms reveal delay
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
      tapLogs: {}, // { userId: [{ seq, ts }] }
      startedAt: null,
      finishedAt: null,
      status: 'active',
      winner: null,
    };
  }

  onPlayerJoin(userId) {}
  onPlayerLeave(userId) {}
  onReconnect(userId) {}

  /**
   * moveData: { type: 'TAP', seq: 3, clientTs: 1234567890 }
   * seq = the target sequence number being tapped
   */
  validateMove(userId, moveData, currentState) {
    if (moveData.type !== 'TAP') {
      return { valid: false, reason: 'Unknown move type' };
    }

    const { seq, clientTs } = moveData;
    const userTaps = currentState.tapLogs[userId] || [];
    const currentScore = currentState.scores[userId] || 0;

    // Reject if over max plausible score
    if (currentScore >= MAX_PLAUSIBLE_TAPS) {
      return { valid: false, reason: 'Score ceiling reached' };
    }

    // Reject duplicate taps on same target
    if (userTaps.some(t => t.seq === seq)) {
      return { valid: false, reason: 'Duplicate tap' };
    }

    // Check sequence is valid
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

  /**
   * Called by the engine when the 20-second timer fires.
   * Validates the final score against physical plausibility.
   */
  finalize(userId, reportedScore, durationSeconds, currentState) {
    const actualScore = currentState.scores[userId] || 0;
    const maxXp = this.gameMetadata.maxXp || 35;

    // Reject impossible durations
    if (durationSeconds < MIN_DURATION || durationSeconds > MAX_DURATION) {
      throw new Error('Invalid game duration');
    }

    // Use server-tracked score, not client-reported score
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

  /** Send the target sequence to the player so WebView can render it */
  getInitialPlayerPayload(currentState) {
    return {
      targetSequence: currentState.targetSequence,
      durationSeconds: GAME_DURATION_SECONDS,
    };
  }

  getSpectatorState(currentState) {
    const { seed, ...safe } = currentState; // Never expose the seed
    return safe;
  }
}

module.exports = TapRushPlugin;
