'use strict';

const GamePlugin = require('../GamePlugin');

/**
 * Memory Grid Plugin
 *
 * A pattern memorization game. The server:
 * - Generates all patterns for every round using a seeded HMAC chain
 * - Validates player input against the server-side pattern (client never decides correctness)
 * - Tracks rounds and score entirely server-side
 *
 * Pattern: A 3x3 grid (9 tiles). Server reveals a sequence; player must replay it.
 * Each round adds one more tile to the sequence.
 */

const GRID_SIZE = 9;
const STARTING_PATTERN_LENGTH = 2;
const MAX_ROUNDS = 5;
const MAX_PLAUSIBLE_SCORE = MAX_ROUNDS;

class MemoryGridPlugin extends GamePlugin {
  constructor(matchData) {
    super(matchData);
    this.players = matchData.players || [];
    this.gameMetadata = matchData.metadata || {};
  }

  /** Generate a round's pattern from the seed + round index */
  _generatePattern(seed, round) {
    const crypto = require('crypto');
    const length = STARTING_PATTERN_LENGTH + round; // round 0 = 2 tiles, round 4 = 6 tiles
    const pattern = [];
    for (let i = 0; i < length; i++) {
      const hash = crypto
        .createHmac('sha256', seed)
        .update(`${round}:${i}`)
        .digest('hex');
      pattern.push(parseInt(hash.slice(0, 2), 16) % GRID_SIZE);
    }
    return pattern;
  }

  createState() {
    const crypto = require('crypto');
    const seed = crypto.randomBytes(16).toString('hex');
    const scores = {};
    this.players.forEach(p => { scores[p.userId] = 0; });

    const firstPattern = this._generatePattern(seed, 0);

    return {
      seed,
      currentRound: 0,
      totalRounds: MAX_ROUNDS,
      currentPattern: firstPattern,
      scores,
      playerInputs: {}, // { userId: [tile indices submitted this round] }
      roundPhase: 'SHOW',   // SHOW → INPUT → RESULT
      startedAt: Date.now(),
      status: 'active',
      winner: null,
    };
  }

  onPlayerJoin(userId) {}
  onPlayerLeave(userId) {}
  onReconnect(userId) {}

  /**
   * moveData: { type: 'INPUT', tiles: [0, 4, 7, ...] }
   * The player submits their full pattern guess for the current round.
   */
  validateMove(userId, moveData, currentState) {
    if (moveData.type === 'READY_INPUT') {
      // Tolerate a late READY_INPUT landing after the phase already flipped to
      // INPUT (e.g. the bot's READY_INPUT firing after the real player's flip).
      // Treat it as a no-op instead of rejecting it, so the bot session never
      // errors and the round keeps flowing.
      if (currentState.roundPhase !== 'SHOW' && currentState.roundPhase !== 'INPUT') {
        return { valid: false, reason: 'Not in show phase' };
      }
      return { valid: true };
    }

    if (moveData.type !== 'INPUT') {
      return { valid: false, reason: 'Unknown move type' };
    }

    if (currentState.roundPhase !== 'INPUT') {
      return { valid: false, reason: 'Not in input phase' };
    }

    if (!Array.isArray(moveData.tiles) || moveData.tiles.length !== currentState.currentPattern.length) {
      return { valid: false, reason: 'Incorrect number of tiles submitted' };
    }

    // Validate all tile indices are in range
    if (moveData.tiles.some(t => t < 0 || t >= GRID_SIZE)) {
      return { valid: false, reason: 'Invalid tile index' };
    }

    return { valid: true };
  }

  applyMove(userId, moveData, currentState) {
    if (moveData.type === 'READY_INPUT') {
      // Late READY_INPUT after the phase already flipped — no-op, nothing to do.
      if (currentState.roundPhase === 'INPUT') return currentState;

      const readyPlayers = currentState.readyPlayers || [];
      if (!readyPlayers.includes(userId)) {
        readyPlayers.push(userId);
      }
      // Only real players gate the reveal — bots read the pattern straight from
      // the state and never need to "watch" it, so a missing/late bot
      // READY_INPUT must never stall the round (tap area would never appear).
      const realIds = this.players
        .filter(p => !String(p.userId || p.id || '').startsWith('bot_'))
        .map(p => p.userId || p.id);
      const readyReal = readyPlayers.filter(id => realIds.includes(id));
      if (realIds.length === 0 || readyReal.length >= realIds.length) {
        return { ...currentState, roundPhase: 'INPUT', readyPlayers: [] };
      }
      return { ...currentState, readyPlayers };
    }

    const { tiles } = moveData;
    const correct = tiles.every((t, i) => t === currentState.currentPattern[i]);

    const newScores = { ...currentState.scores };
    const newPlayerInputs = { ...currentState.playerInputs, [userId]: tiles };

    if (!correct) {
      // Game over for this player — if they are wrong, they lose
      const winner = Object.entries(newScores).sort((a, b) => b[1] - a[1])[0][0];
      return {
        ...currentState,
        scores: newScores,
        status: 'finished',
        winner,
        playerInputs: newPlayerInputs,
      };
    }

    newScores[userId] = (newScores[userId] || 0) + 1;

    const numPlayers = Object.keys(newScores).length;
    const numInputs = Object.keys(newPlayerInputs).length;

    if (numInputs < numPlayers) {
      // Wait for other players
      return {
        ...currentState,
        scores: newScores,
        playerInputs: newPlayerInputs,
      };
    }

    const isLastRound = currentState.currentRound >= currentState.totalRounds - 1;

    if (isLastRound) {
      const winner = Object.entries(newScores).sort((a, b) => b[1] - a[1])[0][0];
      return {
        ...currentState,
        scores: newScores,
        status: 'finished',
        winner,
        playerInputs: newPlayerInputs,
      };
    }

    // Advance to next round
    const nextRound = currentState.currentRound + 1;
    const nextPattern = this._generatePattern(currentState.seed, nextRound);

    return {
      ...currentState,
      scores: newScores,
      currentRound: nextRound,
      currentPattern: nextPattern,
      roundPhase: 'SHOW',
      playerInputs: {},
    };
  }

  isFinished(currentState) {
    return currentState.status === 'finished';
  }

  calculateReward(currentState, userId) {
    const score = currentState.scores[userId] || 0;
    const maxXp = this.gameMetadata.maxXp || 45;
    const xpEarned = Math.min(maxXp, score > 0 ? 8 + Math.floor((score * maxXp) / MAX_ROUNDS) : 0);

    return {
      result: currentState.winner === userId ? 'WIN' : 'LOSS',
      xpEarned,
    };
  }

  /** 
   * Sent to the player when their INPUT phase starts.
   * Does NOT expose the seed.
   */
  getRoundPayload(currentState) {
    return {
      round: currentState.currentRound,
      patternLength: currentState.currentPattern.length,
      // Pattern itself is revealed during SHOW phase via WebSocket SYNC events
    };
  }

  getSpectatorState(currentState) {
    const { seed, ...safe } = currentState; // Never expose the seed
    return safe;
  }
}

module.exports = MemoryGridPlugin;
