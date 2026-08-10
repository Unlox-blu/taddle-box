'use strict';

const GamePlugin = require('../GamePlugin');

// Length of the SHARED track loop (mirrors the client's LUDO_PATH — 52 cells,
// 13 per player). Token positions are RELATIVE to the player's own start:
// pos 0 is their start square, pos 51 is the last loop cell before their home
// column, and the ABSOLUTE loop index is (START_POSITIONS[pi] + pos) % 52.
// The client renders the same way (PLAYER_PATH_OFFSET + pos), so keeping
// positions relative keeps the board, home-lane entry and captures in sync.
const START_POSITIONS = { 0: 0, 1: 13, 2: 26, 3: 39 }; // absolute loop index of each player's start
const LOOP_LEN = 52;
// Absolute loop indices of the safe cells — the four start cells plus the four
// middle-cross cells — where a capture cannot happen. Mirrors the client's
// SAFE_CELLS grid set (converted to loop indices).
const SAFE_PATH_IDX = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

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
        // Enter at the player's OWN start square (relative pos 0). The client
        // renders (PLAYER_PATH_OFFSET[pi] + pos), so absolute starts (13/26/39)
        // used to displace every non-red player to the wrong loop segment and
        // teleport coins diagonally across the board at the home-lane entry.
        token.pos = 0;
      } else if (token.pos >= 0) {
        token.pos = Math.min(57, token.pos + diceValue);
      }

      // Capture rule: landing on a SHARED track cell (pos 0..51) occupied by
      // an opponent token (safe cells are exempt) sends that token back to its
      // yard (pos -1). Tokens on their own home column (52..56) can never be
      // captured. The client animates the captured token running home.
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
