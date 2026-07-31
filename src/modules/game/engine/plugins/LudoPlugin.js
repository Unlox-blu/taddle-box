'use strict';

const GamePlugin = require('../GamePlugin');

/**
 * Ludo Plugin — supports 2 or 4 players
 * Each player has 4 tokens.
 * Tokens start at HOME (-1), enter the board at their player's start position,
 * and must travel 56 squares to reach HOME COLUMN, then HOME (pos 57).
 */
const START_POSITIONS = { 0: 1, 1: 15, 2: 29, 3: 43 }; // Absolute board squares per player index
const HOME_COLUMN_START = { 0: 51, 1: 11, 2: 24, 3: 38 }; // Entry to home column

class LudoPlugin extends GamePlugin {
  constructor(matchData) {
    super(matchData);
    this.players = matchData.players || [];
  }

  createState() {
    const tokens = {};
    this.players.forEach((p, idx) => {
      tokens[p.userId] = [
        { id: 0, pos: -1, playerIndex: idx }, // -1 = HOME (yard)
        { id: 1, pos: -1, playerIndex: idx },
        { id: 2, pos: -1, playerIndex: idx },
        { id: 3, pos: -1, playerIndex: idx },
      ];
    });

    return {
      tokens,
      turnOrder: this.players.map(p => p.userId),
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

    const { diceValue, tokenId } = moveData;

    if (!diceValue || diceValue < 1 || diceValue > 6) {
      return { valid: false, reason: 'Invalid dice value' };
    }

    const playerTokens = currentState.tokens[userId];
    const token = playerTokens?.find(t => t.id === tokenId);

    if (!token) {
      return { valid: false, reason: 'Invalid token' };
    }

    // Can only enter board on a 6
    if (token.pos === -1 && diceValue !== 6) {
      return { valid: false, reason: 'Need a 6 to enter the board' };
    }

    return { valid: true };
  }

  applyMove(userId, moveData, currentState) {
    const { diceValue, tokenId } = moveData;
    const playerIndex = currentState.turnOrder.indexOf(userId);

    const newTokens = JSON.parse(JSON.stringify(currentState.tokens));
    const token = newTokens[userId].find(t => t.id === tokenId);

    if (token.pos === -1 && diceValue === 6) {
      // Enter the board
      token.pos = START_POSITIONS[playerIndex];
    } else if (token.pos >= 0) {
      token.pos += diceValue;
      // Simplified: if token reaches or passes 57, it's home
      if (token.pos >= 57) {
        token.pos = 57; // HOME
      }
    }

    // Check if this player has all tokens home
    const allHome = newTokens[userId].every(t => t.pos === 57);

    // Advance turn (unless dice was 6 — player gets another turn)
    const nextTurnIndex = diceValue === 6
      ? currentState.currentTurnIndex
      : (currentState.currentTurnIndex + 1) % currentState.turnOrder.length;

    return {
      ...currentState,
      tokens: newTokens,
      lastDice: diceValue,
      currentTurnIndex: nextTurnIndex,
      roundCount: currentState.roundCount + 1,
      status: allHome ? 'finished' : 'active',
      winner: allHome ? userId : null,
    };
  }

  isFinished(currentState) {
    return currentState.status === 'finished';
  }

  calculateReward(currentState, userId) {
    if (currentState.winner === userId) return { result: 'WIN', xpEarned: 80 };
    return { result: 'LOSS', xpEarned: 10 };
  }

  getSpectatorState(currentState) {
    return currentState;
  }
}

module.exports = LudoPlugin;
