'use strict';

const GamePlugin = require('../GamePlugin');

/**
 * Board layout for Snake & Ladder (1-100)
 * snakes: { head: tail }
 * ladders: { bottom: top }
 */
const SNAKES = {
  99: 54, 70: 55, 52: 42, 43: 22, 36: 6, 32: 10, 49: 11
};
const LADDERS = {
  4: 25, 13: 46, 33: 49, 42: 63, 50: 69, 62: 81, 74: 92
};

class SnakeLadderPlugin extends GamePlugin {
  constructor(matchData) {
    super(matchData);
    this.players = matchData.players || [];
  }

  createState() {
    const positions = {};
    this.players.forEach(p => { positions[p.userId] = 0; }); // 0 = not started, 1-100 = board pos
    const turnOrder = this.players.map(p => p.userId);
    return {
      positions,
      turnOrder,
      currentTurnIndex: 0,
      lastDice: null,
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
    // moveData: { diceValue } — must come from the server-generated dice
    if (!moveData.diceValue || moveData.diceValue < 1 || moveData.diceValue > 6) {
      return { valid: false, reason: 'Invalid dice value' };
    }
    return { valid: true };
  }

  applyMove(userId, moveData, currentState) {
    const { diceValue } = moveData;
    const pos = currentState.positions[userId];
    let newPos = pos + diceValue;

    if (newPos > 100) {
      // Can't overshoot 100
      newPos = pos;
    } else {
      // Check for snake
      if (SNAKES[newPos]) newPos = SNAKES[newPos];
      // Check for ladder
      if (LADDERS[newPos]) newPos = LADDERS[newPos];
    }

    const newPositions = { ...currentState.positions, [userId]: newPos };
    const nextTurnIndex = (currentState.currentTurnIndex + 1) % currentState.turnOrder.length;

    const winner = newPos === 100 ? userId : null;
    return {
      ...currentState,
      positions: newPositions,
      lastDice: diceValue,
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
