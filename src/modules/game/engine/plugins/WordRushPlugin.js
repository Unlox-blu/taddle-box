'use strict';

const GamePlugin = require('../GamePlugin');

const WORDS = require('./wordList.json');
const WORD_SET = new Set(WORDS);

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
    // Simultaneous: anyone can submit words
    return true;
  }

  getTimers(state) {
    const config = this.configSnapshot || {};
    const roundTimeoutMs = config.roundTimeoutMs || 90000;

    return [{
      type: 'round',
      durationMs: roundTimeoutMs,
      jobData: { gameSlug: 'word-rush' },
    }];
  }

  getCommandTimeoutMs() {
    return 500;
  }

  _generateGrid() {
    const LETTERS = 'AAABCDDEEEFGHIIIJKLMMNOOOOPQRRSSSTTTTUUUVWXYZ';
    const grid = [];
    for (let i = 0; i < 16; i++) {
      grid.push(LETTERS[Math.floor(Math.random() * LETTERS.length)]);
    }
    return grid;
  }

  _isAdjacentPath(path) {
    const toRC = idx => ({ r: Math.floor(idx / 4), c: idx % 4 });
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
      totalRounds: this.matchData?.configured_rounds || 1,
      roundStartedAt: Date.now(),
      status: 'active',
      winner: null,
    };
  }

  onPlayerJoin(userId) {}
  onPlayerLeave(userId) {}
  onReconnect(userId) {}
  cleanup() {}

  validateMove(userId, moveData, currentState) {
    const { path, word } = moveData;

    if (!word || word.length < 3) {
      return { valid: false, reason: 'Word too short (min 3 letters)' };
    }

    const foundWords = currentState.foundWords || [];
    if (foundWords.some(fw => fw.word === word.toUpperCase())) {
      return { valid: false, reason: 'Word already used this round' };
    }

    if (!Array.isArray(path) || path.length !== word.length) {
      return { valid: false, reason: 'Invalid path' };
    }

    if (!this._isAdjacentPath(path)) {
      return { valid: false, reason: 'Letters are not adjacent' };
    }

    const formedWord = path.map(idx => currentState.grid[idx]).join('').toUpperCase();
    if (formedWord !== word.toUpperCase()) {
      return { valid: false, reason: 'Path does not spell the submitted word' };
    }

    if (!WORD_SET.has(word.toUpperCase())) {
      return { valid: false, reason: 'Not a valid word' };
    }

    return { valid: true };
  }

  applyMove(userId, moveData, currentState) {
    const { word } = moveData;
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
      const winner = Object.entries(currentState.scores)
        .sort((a, b) => b[1] - a[1])[0][0];
      return { ...currentState, status: 'finished', winner };
    }

    return {
      ...currentState,
      grid: this._generateGrid(),
      foundWords: [],
      currentRound: currentState.currentRound + 1,
      roundStartedAt: Date.now(),
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
