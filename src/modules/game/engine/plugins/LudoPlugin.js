'use strict';

const GamePlugin = require('../GamePlugin');
const { seededShuffle } = require('../../../../utils/seededShuffle');

const START_POSITIONS = { 0: 0, 1: 13, 2: 26, 3: 39 };
const LOOP_LEN = 51;
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
    if (!state.turnOrder || state.currentTurnIndex === null || state.currentTurnIndex === undefined) return false;
    return state.turnOrder[state.currentTurnIndex] === userId;
  }

  getTimers(_state) {
    const turnTimeoutMs = 10000;

    return [{
      type: 'turn',
      durationMs: turnTimeoutMs,
      jobData: { gameSlug: 'ludo' },
    }];
  }

  getCommandTimeoutMs() {
    // The actor runs a full PG transaction (reserve + event + snapshot + outbox) +
    // Redis write per command. Ludo commands must tolerate normal database
    // variance without allowing a completed transaction to surface as a
    // client-side timeout.
    return 5000;
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

  onPlayerJoin(_userId) {}
  onPlayerLeave(_userId) {}
  onReconnect(_userId) {}
  cleanup() {}

  onTimerExpired(state, timerType, _userId, action) {
    if (timerType !== 'turn') return state;
    // Timeout phases are separate: one timer rolls, the next timer moves.
    const currentPlayerId = state.turnOrder[state.currentTurnIndex];
    if (action === 'ROLL') {
      return this.applyMove(currentPlayerId, { type: 'ROLL' }, state);
    }
    if (action === 'MOVE') {
      const tokenId = state.movableTokens?.[0];
      if (tokenId !== null && tokenId !== undefined) return this.applyMove(currentPlayerId, { type: 'MOVE_TOKEN', tokenId }, state);
      return {
        ...state,
        dice: null,
        movableTokens: [],
        currentTurnIndex: ((state.currentTurnIndex || 0) + 1) % (state.turnOrder?.length || 1),
      };
    }
    return this.applyMove(currentPlayerId, { type: 'ROLL' }, state);
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
      let captured = false;
      if (token.pos >= 0 && token.pos < LOOP_LEN) {
        const abs = (START_POSITIONS[playerIndex] + token.pos) % LOOP_LEN;
        if (!SAFE_PATH_IDX.has(abs)) {
          Object.keys(newTokens).forEach((uid) => {
            if (uid === userId) return;
            newTokens[uid].forEach((opp) => {
              if (opp.pos >= 0 && opp.pos < LOOP_LEN) {
                const oppAbs = (START_POSITIONS[(opp.playerIndex ?? 0)] + opp.pos) % LOOP_LEN;
                if (oppAbs === abs) {
                  opp.pos = -1;
                  captured = true;
                }
              }
            });
          });
        }
      }

      const allHome = newTokens[userId].every(t => t.pos === 57);
      const reachedHome = token.pos === 57;
      const nextIdx = (diceValue === 6 || captured || reachedHome) && !allHome
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
