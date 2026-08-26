'use strict';

const GamePlugin = require('../GamePlugin');
const { seededShuffle } = require('../../../../utils/seededShuffle');

const SNAKES = {
  99: 80, 95: 75, 92: 88, 89: 58, 74: 53,
  62: 19, 64: 60, 46: 25, 49: 11, 16: 6,
};
const LADDERS = {
  87: 94, 78: 98, 71: 91, 51: 67, 36: 44,
  21: 42, 28: 84, 15: 26, 2: 38, 7: 14, 8: 31,
};

/**
 * Snake & Ladder Plugin — ported to new architecture.
 */
class SnakeLadderPlugin extends GamePlugin {
  static EXECUTION_MODEL = 'turn-based';

  constructor(matchData) {
    super(matchData);
    this.players = matchData.players || [];
  }

  getBotColor(players) {
    const used = players.filter(p => !String(p.userId || '').startsWith('bot_')).map(p => p.color);
    const palette = ['red', 'blue', 'green', 'yellow'];
    return palette.find(c => !used.includes(c)) || palette[players.length % 4];
  }

  canPlayerAct(state, userId) {
    if (!state.turnOrder || state.currentTurnIndex == null) return false;
    return state.turnOrder[state.currentTurnIndex] === userId;
  }

  getTimers(state) {
    const config = this.configSnapshot || {};
    const turnTimeoutMs = config.turnTimeoutMs || 12000;

    return [{
      type: 'turn',
      durationMs: turnTimeoutMs,
      jobData: { gameSlug: 'snake-ladder' },
    }];
  }

  getCommandTimeoutMs() {
    return 500;
  }

  createState() {
    const matchGroupId = this.matchData?.matchGroupId || this.matchData?.lobbyId || 'default';
    const shuffled = seededShuffle(this.players, `${matchGroupId}:r0`);
    const positions = {};
    const turnOrder = shuffled.map(p => p.userId);
    shuffled.forEach(p => { positions[p.userId] = 0; });
    return {
      positions,
      turnOrder,
      currentTurnIndex: 0,
      pendingDice: null,
      lastDice: null,
      lastEvent: null,
      status: 'active',
      winner: null,
      roundCount: 0,
    };
  }

  onPlayerJoin(userId) {}
  onPlayerLeave(userId) {}
  onReconnect(userId) {}
  cleanup() {}

  onTimerExpired(state, timerType, userId) {
    if (timerType !== 'turn') return state;
    // Auto-roll for the timed-out player
    const currentPlayerId = state.turnOrder[state.currentTurnIndex];
    return this.applyMove(currentPlayerId, { type: 'ROLL' }, state);
  }

  validateMove(userId, moveData, currentState) {
    const currentPlayerId = currentState.turnOrder[currentState.currentTurnIndex];
    if (userId !== currentPlayerId) {
      return { valid: false, reason: 'Not your turn' };
    }
    if (moveData.type === 'ROLL') {
      return { valid: true };
    }
    return { valid: false, reason: 'Unknown move type' };
  }

  applyMove(userId, moveData, currentState) {
    const diceValue = Math.floor(Math.random() * 6) + 1;
    const pos = currentState.positions[userId];
    let newPos = pos + diceValue;
    let lastEvent = null;

    if (newPos > 100) {
      newPos = pos;
    } else {
      if (SNAKES[newPos] !== undefined) {
        newPos = SNAKES[newPos];
        lastEvent = 'snake';
      } else if (LADDERS[newPos] !== undefined) {
        newPos = LADDERS[newPos];
        lastEvent = 'ladder';
      }
    }

    const newPositions = { ...currentState.positions, [userId]: newPos };
    const nextTurnIndex = (currentState.currentTurnIndex + 1) % currentState.turnOrder.length;
    const winner = newPos === 100 ? userId : null;

    return {
      ...currentState,
      positions: newPositions,
      lastDice: diceValue,
      pendingDice: null,
      lastEvent,
      currentTurnIndex: nextTurnIndex,
      roundCount: currentState.roundCount + 1,
      status: winner ? 'finished' : 'active',
      winner,
    };
  }

  isFinished(currentState) {
    return currentState.status === 'finished';
  }

  calculateReward(currentState, userId) {
    if (currentState.winner === userId) return { result: 'WIN', xpEarned: 60 };
    if (currentState.winner === null || currentState.winner === undefined) return { result: 'DRAW', xpEarned: 15 };
    return { result: 'LOSS', xpEarned: 10 };
  }

  getSpectatorState(currentState) {
    return currentState;
  }
}

module.exports = SnakeLadderPlugin;
