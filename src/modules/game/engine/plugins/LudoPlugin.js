'use strict';

const GamePlugin = require('../GamePlugin');

const START_POSITIONS = { 0: 0, 1: 13, 2: 26, 3: 39 }; // Step on the path

class LudoPlugin extends GamePlugin {
  constructor(matchData) {
    super(matchData);
    this.players = matchData.players || [];
  }

  createState() {
    const tokens = {};
    const turnOrder = [];
    this.players.forEach((p, idx) => {
      tokens[p.userId] = [
        { id: 0, pos: -1, playerIndex: idx },
        { id: 1, pos: -1, playerIndex: idx },
        { id: 2, pos: -1, playerIndex: idx },
        { id: 3, pos: -1, playerIndex: idx },
      ];
      turnOrder.push(p.userId);
    });

    return {
      tokens,
      turnOrder,
      currentTurnIndex: 0,
      dice: null,          // null = not rolled yet, number = rolled, awaiting move
      lastDice: null,
      movableTokens: [],
      status: 'active',
      winner: null,
      roundCount: 0,
    };
  }

  onPlayerJoin(userId) {}
  onPlayerLeave(userId) {}
  onReconnect(userId) {}

  _getMovableTokens(userId, diceValue, state) {
    const playerTokens = state.tokens[userId] || [];
    return playerTokens
      .filter(t => {
        if (t.pos === 57) return false; // already home
        if (t.pos === -1) return diceValue === 6; // need 6 to enter
        return t.pos + diceValue <= 57;
      })
      .map(t => t.id);
  }

  validateMove(userId, moveData, currentState) {
    const currentPlayerId = currentState.turnOrder[currentState.currentTurnIndex];
    if (userId !== currentPlayerId) {
      return { valid: false, reason: 'Not your turn' };
    }

    if (moveData.type === 'ROLL') {
      if (currentState.dice !== null) {
        return { valid: false, reason: 'Already rolled this turn' };
      }
      return { valid: true };
    }

    if (moveData.type === 'MOVE_TOKEN') {
      if (currentState.dice === null) {
        return { valid: false, reason: 'Roll the dice first' };
      }
      const { tokenId } = moveData;
      if (!currentState.movableTokens.includes(tokenId)) {
        return { valid: false, reason: 'That token cannot move' };
      }
      return { valid: true };
    }

    return { valid: false, reason: 'Unknown move type' };
  }

  applyMove(userId, moveData, currentState) {
    if (moveData.type === 'ROLL') {
      const diceValue = Math.floor(Math.random() * 6) + 1;
      const movable = this._getMovableTokens(userId, diceValue, currentState);

      // If no movable tokens, advance turn
      if (movable.length === 0) {
        const nextIdx = (currentState.currentTurnIndex + 1) % currentState.turnOrder.length;
        return { ...currentState, dice: null, lastDice: diceValue, movableTokens: [], currentTurnIndex: nextIdx };
      }

      return { ...currentState, dice: diceValue, lastDice: diceValue, movableTokens: movable };
    }

    if (moveData.type === 'MOVE_TOKEN') {
      const { tokenId } = moveData;
      const diceValue = currentState.dice;
      const playerIndex = currentState.turnOrder.indexOf(userId);

      const newTokens = JSON.parse(JSON.stringify(currentState.tokens));
      const token = newTokens[userId].find(t => t.id === tokenId);

      if (token.pos === -1 && diceValue === 6) {
        token.pos = START_POSITIONS[playerIndex];
      } else if (token.pos >= 0) {
        token.pos = Math.min(57, token.pos + diceValue);
      }

      const allHome = newTokens[userId].every(t => t.pos === 57);
      // Get another turn on 6, or advance
      const nextIdx = diceValue === 6 && !allHome
        ? currentState.currentTurnIndex
        : (currentState.currentTurnIndex + 1) % currentState.turnOrder.length;

      return {
        ...currentState,
        tokens: newTokens,
        dice: null,
        lastDice: diceValue,
        movableTokens: [],
        currentTurnIndex: nextIdx,
        roundCount: currentState.roundCount + 1,
        status: allHome ? 'finished' : 'active',
        winner: allHome ? userId : null,
      };
    }

    return currentState;
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
