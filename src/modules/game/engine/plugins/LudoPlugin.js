'use strict';

const GamePlugin = require('../GamePlugin');
const { seededShuffle } = require('../../../../utils/seededShuffle');

const START_POSITIONS = { 0: 0, 1: 13, 2: 26, 3: 39 };
const LOOP_LEN = 52;
const SAFE_PATH_IDX = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
const COLOR_NAMES = ['red', 'green', 'yellow', 'blue'];

/**
 * Ludo Plugin — ported to new architecture.
 *
 * canPlayerAct: checks turnOrder[currentTurnIndex]
 * getTimers: returns turn timer from config or default 30s
 * applyMove: returns complete state (plugin-authoritative turn advancement)
 */
class LudoPlugin extends GamePlugin {
  static EXECUTION_MODEL = 'turn-based';

  constructor(matchData) {
    super(matchData);
    this.players = matchData.players || [];
  }

  getBotColor(players) {
    const used = players.filter(p => !String(p.userId || '').startsWith('bot_')).map(p => p.color);
    const palette = ['red', 'green', 'yellow', 'blue'];
    return palette.find(c => !used.includes(c)) || palette[players.length % 4];
  }

  // ── Turn Authority ────────────────────────────────────────────────────

  canPlayerAct(state, userId) {
    if (!state.turnOrder || state.currentTurnIndex == null) return false;
    return state.turnOrder[state.currentTurnIndex] === userId;
  }

  getTimers(state) {
    const config = this.configSnapshot || {};
    const turnTimeoutMs = config.turnTimeoutMs || 30000; // 30s default

    return [{
      type: 'turn',
      durationMs: turnTimeoutMs,
      jobData: { gameSlug: 'ludo' },
    }];
  }

  getCommandTimeoutMs() {
    return 500;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────

  /**
   * Build a deterministic shuffle seed from match identity.
   * Combines matchGroupId (lobby) with round number so each round
   * can produce a different colour assignment while staying replayable.
   */
  _shuffleSeed(round = 0) {
    const matchGroupId = this.matchData?.matchGroupId || this.matchData?.lobbyId || 'default';
    return `${matchGroupId}:r${round}`;
  }

  /**
   * Shuffle players and build the turnOrder + playerColors mapping.
   * Extracted so it can be called from createState() and from
   * reassignColors() for per-round colour reassignment.
   */
  _buildTurnOrder(round = 0) {
    const shuffled = seededShuffle(this.players, this._shuffleSeed(round));
    const turnOrder = [];
    const playerColors = {};  // { userId: { color: 'red', index: 0 } }
    const tokens = {};

    shuffled.forEach((p, idx) => {
      turnOrder.push(p.userId);
      playerColors[p.userId] = { color: COLOR_NAMES[idx], index: idx };
      tokens[p.userId] = [
        { id: 0, pos: -1, playerIndex: idx },
        { id: 1, pos: -1, playerIndex: idx },
        { id: 2, pos: -1, playerIndex: idx },
        { id: 3, pos: -1, playerIndex: idx },
      ];
    });

    return { turnOrder, playerColors, tokens };
  }

  createState() {
    const { turnOrder, playerColors, tokens } = this._buildTurnOrder(0);

    return {
      tokens,
      turnOrder,
      playerColors,  // Backend-driven colour assignment — frontend reads this, not hardcoded.
      currentTurnIndex: 0,
      dice: null,
      lastDice: null,
      movableTokens: [],
      status: 'active',
      winner: null,
      roundCount: 0,
    };
  }

  /**
   * Reassign colours for a new round. Called by the round lifecycle
   * handler when configuredRounds > 1. Resets all tokens to the yard,
   * shuffles turn order with a new seed, and returns the fresh state.
   */
  reassignColors(currentState, roundNumber) {
    const { turnOrder, playerColors, tokens } = this._buildTurnOrder(roundNumber);
    return {
      ...currentState,
      tokens,
      turnOrder,
      playerColors,
      currentTurnIndex: 0,
      dice: null,
      lastDice: null,
      movableTokens: [],
      roundCount: roundNumber,
    };
  }

  onPlayerJoin(userId) {}
  onPlayerLeave(userId) {}
  onReconnect(userId) {}
  cleanup() {}

  onTimerExpired(state, timerType, userId) {
    if (timerType !== 'turn') return state;
    // Auto-move: roll dice + move first movable token
    const currentPlayerId = state.turnOrder[state.currentTurnIndex];
    let ps = state;
    if (ps.dice == null) {
      ps = this.applyMove(currentPlayerId, { type: 'ROLL' }, ps);
    }
    if (ps.dice != null && (ps.movableTokens || []).length > 0) {
      ps = this.applyMove(currentPlayerId, { type: 'MOVE_TOKEN', tokenId: ps.movableTokens[0] }, ps);
    } else if (ps.dice != null) {
      // No movable tokens — pass turn
      ps = {
        ...ps,
        dice: null,
        movableTokens: [],
        currentTurnIndex: ((ps.currentTurnIndex || 0) + 1) % (ps.turnOrder?.length || 1),
      };
    }
    return ps;
  }

  // ── Mechanics ─────────────────────────────────────────────────────────

  _getMovableTokens(userId, diceValue, state) {
    const playerTokens = state.tokens[userId] || [];
    return playerTokens
      .filter(t => {
        if (t.pos === 57) return false;
        if (t.pos === -1) return diceValue === 6;
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
        token.pos = 0;
      } else if (token.pos >= 0) {
        token.pos = Math.min(57, token.pos + diceValue);
      }

      // Capture
      if (token.pos >= 0 && token.pos <= 51) {
        const abs = (START_POSITIONS[playerIndex] + token.pos) % LOOP_LEN;
        if (!SAFE_PATH_IDX.has(abs)) {
          Object.keys(newTokens).forEach((uid) => {
            if (uid === userId) return;
            newTokens[uid].forEach((opp) => {
              if (opp.pos >= 0 && opp.pos <= 51) {
                const oppAbs = (START_POSITIONS[(opp.playerIndex ?? 0)] + opp.pos) % LOOP_LEN;
                if (oppAbs === abs) opp.pos = -1;
              }
            });
          });
        }
      }

      const allHome = newTokens[userId].every(t => t.pos === 57);
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
    if (currentState.winner === null || currentState.winner === undefined) return { result: 'DRAW', xpEarned: 20 };
    return { result: 'LOSS', xpEarned: 10 };
  }

  getSpectatorState(currentState) {
    return currentState;
  }
}

module.exports = LudoPlugin;
