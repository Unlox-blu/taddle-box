'use strict';

const { Chess } = require('chess.js');
const GamePlugin = require('../GamePlugin');

/**
 * Chess Plugin — uses chess.js for 100% server-side rule validation.
 * 
 * No chess logic is written manually. The engine handles:
 * - Move validation (including castling, en passant, promotion)
 * - Check / checkmate / stalemate / draw detection
 * - FEN serialization for state snapshots
 */
class ChessPlugin extends GamePlugin {
  constructor(matchData) {
    super(matchData);
    // players: [{ userId, color }] where color is 'w' or 'b'
    this.players = matchData.players || [];
  }

  /** Returns the userId assigned the given color */
  _getPlayerByColor(color) {
    return this.players.find(p => p.color === color)?.userId;
  }

  /** Returns the color assigned to a userId */
  _getColorByUser(userId) {
    return this.players.find(p => p.userId === userId)?.color;
  }

  createState() {
    const chess = new Chess();
    return {
      fen: chess.fen(),
      turn: 'w',
      moveHistory: [],
      status: 'active',
      winner: null,
      drawReason: null,
    };
  }

  onPlayerJoin(userId) {}
  onPlayerLeave(userId) {}

  onReconnect(userId) {
    // Nothing to rebuild — state is in Redis as FEN
  }

  onTimeout(type) {
    // Turn timeout → the player whose turn it is loses
    return { timedOut: true, type };
  }

  cleanup() {}

  validateMove(userId, moveData, currentState) {
    const chess = new Chess(currentState.fen);
    const playerColor = this._getColorByUser(userId);

    // Must be this player's turn
    if (chess.turn() !== playerColor) {
      return { valid: false, reason: 'Not your turn' };
    }

    // Attempt the move using chess.js
    try {
      const result = chess.move(moveData); // moveData: { from, to, promotion? }
      return result ? { valid: true } : { valid: false, reason: 'Illegal move' };
    } catch {
      return { valid: false, reason: 'Illegal move' };
    }
  }

  applyMove(userId, moveData, currentState) {
    const chess = new Chess(currentState.fen);
    const move = chess.move(moveData);

    const newState = {
      ...currentState,
      fen: chess.fen(),
      turn: chess.turn(),
      moveHistory: [...currentState.moveHistory, move],
    };

    // Check terminal conditions
    if (chess.isCheckmate()) {
      newState.status = 'finished';
      newState.winner = userId; // The player who just moved wins
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
    if (currentState.winner === userId) {
      return { result: 'WIN', xpEarned: 100 };
    }
    if (currentState.winner === null) {
      return { result: 'DRAW', xpEarned: 30 };
    }
    return { result: 'LOSS', xpEarned: 10 };
  }

  serialize(currentState) {
    return currentState; // FEN is already compact
  }

  deserialize(serializedState) {
    return serializedState;
  }

  getSpectatorState(currentState) {
    // Spectators see everything in chess (no hidden info)
    return currentState;
  }
}

module.exports = ChessPlugin;
