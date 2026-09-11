'use strict';

const GamePlugin = require('../GamePlugin');

const WORDS = require('./wordList.json');
const WORD_SET = new Set(WORDS);
const GRID_SIZE = 4;
const GRID_CELLS = GRID_SIZE * GRID_SIZE;
const MIN_WORD_LENGTH = 3;

/**
 * Word Rush Plugin — ported to new architecture.
 *
 * canPlayerAct: anyone can submit words (simultaneous)
 * getTimers: returns round timer from config
 */
class WordRushPlugin extends GamePlugin {
  static EXECUTION_MODEL = 'round-based';

  constructor(matchData) {
    super(matchData);
    this.players = matchData.players || [];
  }

  canPlayerAct(state, userId) {
    return state.status === 'active' && Object.hasOwn(state.scores, userId);
  }

  getRoundDurationMs() {
    const config = this.configSnapshot || {};
    return config.roundTimeoutMs || 90000;
  }

  getTimers() {
    return [{
      type: 'round',
      durationMs: this.getRoundDurationMs(),
      jobData: { gameSlug: 'word-rush' },
    }];
  }

  getCommandTimeoutMs() {
    // The actor runs a full PG transaction (reserve + event + snapshot + outbox) +
    // Redis write per command. 500ms was routinely exceeded on real hardware,
    // aborting VALID moves after the DB work was already done.
    return 2000;
  }

  _generateGrid() {
    const LETTERS = 'AAABCDDEEEFGHIIIJKLMMNOOOOPQRRSSSTTTTUUUVWXYZ';
    let grid;

    do {
      grid = Array.from(
        { length: GRID_CELLS },
        () => LETTERS[Math.floor(Math.random() * LETTERS.length)],
      );
    } while (!this._hasPlayableWord(grid));

    return grid;
  }

  _hasPlayableWord(grid) {
    const search = (index, word, used) => {
      if (word.length >= MIN_WORD_LENGTH && WORD_SET.has(word)) return true;
      if (word.length === MIN_WORD_LENGTH) return false;

      const row = Math.floor(index / GRID_SIZE);
      const col = index % GRID_SIZE;
      for (let rowOffset = -1; rowOffset <= 1; rowOffset++) {
        for (let colOffset = -1; colOffset <= 1; colOffset++) {
          if (rowOffset === 0 && colOffset === 0) continue;
          const nextRow = row + rowOffset;
          const nextCol = col + colOffset;
          if (nextRow < 0 || nextRow >= GRID_SIZE || nextCol < 0 || nextCol >= GRID_SIZE) continue;

          const nextIndex = nextRow * GRID_SIZE + nextCol;
          if (used.has(nextIndex)) continue;

          used.add(nextIndex);
          if (search(nextIndex, word + grid[nextIndex], used)) return true;
          used.delete(nextIndex);
        }
      }
      return false;
    };

    return grid.some((letter, index) => search(index, letter, new Set([index])));
  }

  _isAdjacentPath(path) {
    if (path.some(index => !Number.isInteger(index) || index < 0 || index >= GRID_CELLS)) {
      return false;
    }
    if (new Set(path).size !== path.length) return false;

    const toRC = idx => ({ r: Math.floor(idx / GRID_SIZE), c: idx % GRID_SIZE });
    for (let i = 1; i < path.length; i++) {
      const prev = toRC(path[i - 1]);
      const curr = toRC(path[i]);
      const dr = Math.abs(curr.r - prev.r);
      const dc = Math.abs(curr.c - prev.c);
      if (dr > 1 || dc > 1 || (dr === 0 && dc === 0)) return false;
    }
    return true;
  }

  createState() {
    const scores = {};
    this.players.forEach(p => { scores[p.userId] = 0; });
    return {
      grid: this._generateGrid(),
      scores,
      foundWords: [],
      currentRound: 1,
      totalRounds: this.matchData.configuredRounds,
      roundStartedAt: null,
      roundEndsAt: null,
      status: 'active',
      winner: null,
    };
  }

  onMatchStart(state) {
    const roundStartedAt = Date.now();
    return {
      ...state,
      roundStartedAt,
      roundEndsAt: roundStartedAt + this.getRoundDurationMs(),
    };
  }

  onPlayerJoin(userId) {}
  onPlayerLeave(userId) {}
  onReconnect(userId) {}
  cleanup() {}

  validateMove(userId, moveData, currentState) {
    if (!this.canPlayerAct(currentState, userId)) {
      return { valid: false, reason: 'Round is not active' };
    }

    const { path, word } = moveData || {};
    if (moveData?.type !== 'SUBMIT_WORD') {
      return { valid: false, reason: 'Unsupported move' };
    }

    if (typeof word !== 'string' || word.length < MIN_WORD_LENGTH) {
      return { valid: false, reason: 'Word too short (min 3 letters)' };
    }
    const normalizedWord = word.toUpperCase();

    const foundWords = currentState.foundWords || [];
    if (foundWords.some(fw => fw.word === normalizedWord)) {
      return { valid: false, reason: 'Word already used this round' };
    }

    if (!Array.isArray(path) || path.length !== word.length) {
      return { valid: false, reason: 'Invalid path' };
    }

    if (!this._isAdjacentPath(path)) {
      return { valid: false, reason: 'Letters are not adjacent' };
    }

    const formedWord = path.map(idx => currentState.grid[idx]).join('');
    if (formedWord !== normalizedWord) {
      return { valid: false, reason: 'Path does not spell the submitted word' };
    }

    if (!WORD_SET.has(normalizedWord)) {
      return { valid: false, reason: 'Not a valid word' };
    }

    return { valid: true };
  }

  applyMove(userId, moveData, currentState) {
    const word = moveData.word.toUpperCase();
    const wordScore = word.length;

    const newScores = {
      ...currentState.scores,
      [userId]: (currentState.scores[userId] || 0) + wordScore,
    };

    const foundWords = currentState.foundWords || [];

    return {
      ...currentState,
      scores: newScores,
      foundWords: [...foundWords, { word: word.toUpperCase(), score: wordScore, userId }],
    };
  }

  advanceRound(currentState) {
    if (currentState.currentRound >= currentState.totalRounds) {
      const highestScore = Math.max(...Object.values(currentState.scores));
      const leaders = Object.entries(currentState.scores)
        .filter(([, score]) => score === highestScore)
        .map(([userId]) => userId);
      return {
        ...currentState,
        status: 'finished',
        winner: leaders.length === 1 ? leaders[0] : null,
        drawReason: leaders.length === 1 ? null : 'tie',
      };
    }

    const roundStartedAt = Date.now();

    return {
      ...currentState,
      grid: this._generateGrid(),
      foundWords: [],
      currentRound: currentState.currentRound + 1,
      roundStartedAt,
      roundEndsAt: roundStartedAt + this.getRoundDurationMs(),
    };
  }

  isFinished(currentState) {
    return currentState.status === 'finished';
  }

  calculateReward(currentState, userId) {
    if (currentState.winner === userId) return { result: 'WIN', xpEarned: 50 };
    if (currentState.winner === null || currentState.winner === undefined) return { result: 'DRAW', xpEarned: 15 };
    return { result: 'LOSS', xpEarned: 10 };
  }

  getSpectatorState(currentState) {
    return { ...currentState, foundWords: [] };
  }
}

module.exports = WordRushPlugin;
