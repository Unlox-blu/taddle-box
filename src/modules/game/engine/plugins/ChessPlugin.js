'use strict';

const { Chess } = require('chess.js');
const GamePlugin = require('../GamePlugin');

/**
 * Chess Plugin — uses chess.js for 100% server-side rule validation.
 *
 * New architecture contract:
 *   - canPlayerAct checks chess.turn() vs player color
 *   - getTimers returns turn timer from config snapshot
 *   - applyMove returns complete state (never executor-mutated)
 *   - All state mutations (currentTurnIndex, timers) happen inside plugin
 */
class ChessPlugin extends GamePlugin {
  static EXECUTION_MODEL = 'turn-based';

  constructor(matchData) {
    super(matchData);
    this.players = matchData.players || [];
  }

  getBotColor(players) {
    const used = players.filter(p => !String(p.userId || '').startsWith('bot_')).map(p => p.color);
    return used.includes('b') ? 'w' : 'b';
  }

  _getPlayerByColor(color) {
    return this.players.find(p => p.color === color)?.userId;
  }

  _getColorByUser(userId) {
    if (userId === 'bot_w') return 'w';
    if (userId === 'bot_b') return 'b';
    return this.players.find(p => p.userId === userId)?.color;
  }

  // ── New Architecture: Turn Authority ──────────────────────────────────

  canPlayerAct(state, userId) {
    const chess = new Chess(state.fen);
    const playerColor = this._getColorByUser(userId);
    return chess.turn() === playerColor;
  }

  getTimers(state) {
    const config = this.configSnapshot || {};
    const turnTimeoutMs = config.turnTimeoutMs || 600000; // 10 min default
    const turnColor = state.turn || 'w';
    const remaining = state.timers?.[turnColor] ?? turnTimeoutMs;

    return [{
      type: 'turn',
      durationMs: Math.max(1000, remaining), // minimum 1s
      jobData: { gameSlug: 'chess' },
    }];
  }

  getCommandTimeoutMs() {
    return 500;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────

  createState() {
    const chess = new Chess();
    const wPlayer = this._getPlayerByColor('w') || 'bot_w';
    const bPlayer = this._getPlayerByColor('b') || 'bot_b';

    return {
      fen: chess.fen(),
      turn: 'w',
      turnOrder: [wPlayer, bPlayer],
      currentTurnIndex: 0,
      moveHistory: [],
      status: 'active',
      winner: null,
      drawReason: null,
      timers: { w: 600000, b: 600000 },
      lastMoveTime: Date.now(),
    };
  }

  onTimerExpired(state, timerType, userId) {
    if (timerType !== 'turn') return state;
    // Timed-out player loses — opponent wins by timeout
    const turnOrder = state.turnOrder || [];
    const timedOutPlayer = turnOrder[state.currentTurnIndex];
    const winner = turnOrder.find(id => id !== timedOutPlayer);
    return {
      ...state,
      status: 'finished',
      winner,
      turnOrder: state.turnOrder,
      currentTurnIndex: state.currentTurnIndex,
      timers: { ...state.timers, [state.turn]: 0 },
    };
  }
  cleanup() {}

  // ── Mechanics ─────────────────────────────────────────────────────────

  validateMove(userId, moveData, currentState) {
    const chess = new Chess(currentState.fen);
    const playerColor = this._getColorByUser(userId);

    if (chess.turn() !== playerColor) {
      return { valid: false, reason: 'Not your turn' };
    }

    try {
      const result = chess.move(moveData);
      return result ? { valid: true } : { valid: false, reason: 'Illegal move' };
    } catch {
      return { valid: false, reason: 'Illegal move' };
    }
  }

  applyMove(userId, moveData, currentState) {
    const chess = new Chess(currentState.fen);
    const move = chess.move(moveData);
    const movedColor = this._getColorByUser(userId);

    const now = Date.now();
    const elapsed = currentState.lastMoveTime ? now - currentState.lastMoveTime : 0;

    // Deduct elapsed time from the player who just moved
    const newTimers = { ...currentState.timers };
    newTimers[movedColor] = Math.max(0, (newTimers[movedColor] || 0) - elapsed);

    // Determine next turn index (plugin-authoritative)
    const nextTurnIndex = (currentState.currentTurnIndex + 1) % 2;

    const newState = {
      ...currentState,
      fen: chess.fen(),
      turn: chess.turn(),
      currentTurnIndex: nextTurnIndex,
      moveHistory: [...(currentState.moveHistory || []), move],
      timers: newTimers,
      lastMoveTime: now,
    };

    // Check time forfeit
    if (newTimers[movedColor] === 0) {
      const loserColor = movedColor;
      const winnerColor = loserColor === 'w' ? 'b' : 'w';
      newState.status = 'finished';
      newState.winner = this._getPlayerByColor(winnerColor);
      newState.drawReason = 'timeout';
      return newState;
    }

    // Check terminal conditions
    if (chess.isCheckmate()) {
      newState.status = 'finished';
      newState.winner = userId;
    } else if (chess.isDraw() || chess.isStalemate() || chess.isThreefoldRepetition()) {
      newState.status = 'finished';
      newState.winner = null;
      newState.drawReason = chess.isDraw() ? 'draw' : chess.isStalemate() ? 'stalemate' : 'repetition';
    }

    return newState;
  }

  isFinished(currentState) {
    return currentState.status === 'finished';
  }

  calculateReward(currentState, userId) {
    if (currentState.winner === userId) return { result: 'WIN', xpEarned: 100 };
    if (currentState.winner === null) return { result: 'DRAW', xpEarned: 30 };
    return { result: 'LOSS', xpEarned: 10 };
  }

  serialize(currentState) { return currentState; }
  deserialize(serializedState) { return serializedState; }
  getSpectatorState(currentState) { return currentState; }
}

module.exports = ChessPlugin;
