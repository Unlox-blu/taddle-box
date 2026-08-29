'use strict';

const GamePlugin = require('../GamePlugin');

const GRID_SIZE = 9;
const STARTING_PATTERN_LENGTH = 2;

/**
 * Memory Grid Plugin — ported to new architecture.
 *
 * canPlayerAct: anyone can submit inputs (simultaneous after SHOW phase)
 * getTimers: returns round timer from config
 */
class MemoryGridPlugin extends GamePlugin {
  static EXECUTION_MODEL = 'round-based';

  constructor(matchData) {
    super(matchData);
    this.players = matchData.players || [];
    this.gameMetadata = matchData.metadata || {};
  }

  canPlayerAct(state, userId) {
    // During INPUT phase, anyone can submit
    return state.roundPhase === 'INPUT' || state.roundPhase === 'SHOW';
  }

  getTimers(state) {
    const config = this.configSnapshot || {};
    const roundTimeoutMs = config.roundTimeoutMs || 30000;

    return [{
      type: 'round',
      durationMs: roundTimeoutMs,
      jobData: { gameSlug: 'memory-grid' },
    }];
  }

  getCommandTimeoutMs() {
    return 500;
  }

  _generatePattern(seed, round) {
    const crypto = require('crypto');
    const length = STARTING_PATTERN_LENGTH + round;
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
      totalRounds: this.matchData?.configured_rounds || 1,
      currentPattern: firstPattern,
      scores,
      playerInputs: {},
      roundPhase: 'SHOW',
      startedAt: Date.now(),
      status: 'active',
      winner: null,
    };
  }

  onPlayerJoin(userId) {}
  onPlayerLeave(userId) {}
  onReconnect(userId) {}
  cleanup() {}

  validateMove(userId, moveData, currentState) {
    if (moveData.type === 'READY_INPUT') {
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

    if (moveData.tiles.some(t => t < 0 || t >= GRID_SIZE)) {
      return { valid: false, reason: 'Invalid tile index' };
    }

    return { valid: true };
  }

  applyMove(userId, moveData, currentState) {
    if (moveData.type === 'READY_INPUT') {
      if (currentState.roundPhase === 'INPUT') return currentState;

      const readyPlayers = currentState.readyPlayers || [];
      if (!readyPlayers.includes(userId)) {
        readyPlayers.push(userId);
      }
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
    const xpEarned = Math.min(maxXp, score > 0 ? 8 + Math.floor((score * maxXp) / currentState.totalRounds) : 0);

    return {
      result: currentState.winner === userId ? 'WIN' : 'LOSS',
      xpEarned,
    };
  }

  getRoundPayload(currentState) {
    return {
      round: currentState.currentRound,
      patternLength: currentState.currentPattern.length,
    };
  }

  getSpectatorState(currentState) {
    const { seed, ...safe } = currentState;
    return safe;
  }
}

module.exports = MemoryGridPlugin;
