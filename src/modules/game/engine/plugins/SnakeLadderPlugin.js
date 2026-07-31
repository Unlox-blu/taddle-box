'use strict';

const GamePlugin = require('../GamePlugin');

const SNAKES = { 99: 54, 70: 55, 52: 42, 43: 22, 36: 6, 32: 10, 49: 11 };
const LADDERS = { 4: 25, 13: 46, 33: 49, 42: 63, 50: 69, 62: 81, 74: 92 };

class SnakeLadderPlugin extends GamePlugin {
  constructor(matchData) {
    super(matchData);
    this.players = matchData.players || [];
  }

  createState() {
    const positions = {};
    const turnOrder = this.players.map(p => p.userId);
    this.players.forEach(p => { positions[p.userId] = 0; });
    return {
      positions,
      turnOrder,
      currentTurnIndex: 0,
      pendingDice: null,   // dice rolled, waiting for move (auto-moved)
      lastDice: null,
      lastEvent: null,     // 'snake' | 'ladder' | null
      status: 'active',
      winner: null,
      roundCount: 0,
    };
  }

  onPlayerJoin(userId) {}
  onPlayerLeave(userId) {}
  onReconnect(userId) {}

  validateMove(userId, moveData, currentState) {
    const currentPlayerId = currentState.turnOrder[currentState.currentTurnIndex];
    if (userId !== currentPlayerId) {
      return { valid: false, reason: 'Not your turn' };
    }

    // Frontend sends { type: 'ROLL' } — we roll server-side
    if (moveData.type === 'ROLL') {
      return { valid: true };
    }

    return { valid: false, reason: 'Unknown move type' };
  }

  applyMove(userId, moveData, currentState) {
    // Server-side dice roll
    const diceValue = Math.floor(Math.random() * 6) + 1;
    const pos = currentState.positions[userId];
    let newPos = pos + diceValue;
    let lastEvent = null;

    if (newPos > 100) {
      newPos = pos; // Can't overshoot
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
    return { result: 'LOSS', xpEarned: 10 };
  }

  getSpectatorState(currentState) {
    return currentState;
  }
}

module.exports = SnakeLadderPlugin;
