'use strict';

const GamePlugin = require('../GamePlugin');

const WORDS = require('./wordList.json'); // A curated word list (loaded server-side only)
const WORD_SET = new Set(WORDS);

const ROUND_DURATION_MS = 90 * 1000; // 90 seconds per round
const ROUNDS_PER_GAME = 5;

/**
 * Word Rush Plugin
 *
 * Prompt: A 4x4 letter grid is generated server-side.
 * Players submit words they can form from adjacent letters.
 * The dictionary is NEVER sent to the client.
 */
class WordRushPlugin extends GamePlugin {
  constructor(matchData) {
    super(matchData);
    this.players = matchData.players || [];
  }

  _generateGrid() {
    // Letter frequency weighted for English
    const LETTERS = 'AAABCDDEEEFGHIIIJKLMMNOOOOPQRRSSSTTTTUUUVWXYZ';
    const grid = [];
    for (let i = 0; i < 16; i++) {
      grid.push(LETTERS[Math.floor(Math.random() * LETTERS.length)]);
    }
    return grid;
  }

  _isAdjacentPath(path) {
    // Validate that indices form a valid adjacent chain on a 4x4 grid
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
      usedWords: [],
      currentRound: 1,
      totalRounds: ROUNDS_PER_GAME,
      roundStartedAt: Date.now(),
      status: 'active',
      winner: null,
    };
  }

  onReconnect(userId) {}
  onPlayerJoin(userId) {}
  onPlayerLeave(userId) {}

  validateMove(userId, moveData, currentState) {
    // moveData: { path: [0,1,5,6,...], word: 'WORD' }
    const { path, word } = moveData;

    if (!word || word.length < 3) {
      return { valid: false, reason: 'Word too short (min 3 letters)' };
    }

    if (currentState.usedWords.includes(word.toUpperCase())) {
      return { valid: false, reason: 'Word already used this round' };
    }

    if (!Array.isArray(path) || path.length !== word.length) {
      return { valid: false, reason: 'Invalid path' };
    }

    if (!this._isAdjacentPath(path)) {
      return { valid: false, reason: 'Letters are not adjacent' };
    }

    // Validate the letters in the path spell the word
    const formedWord = path.map(idx => currentState.grid[idx]).join('').toUpperCase();
    if (formedWord !== word.toUpperCase()) {
      return { valid: false, reason: 'Path does not spell the submitted word' };
    }

    // Server-side dictionary check — dictionary never leaves the server
    if (!WORD_SET.has(word.toUpperCase())) {
      return { valid: false, reason: 'Not a valid word' };
    }

    return { valid: true };
  }

  applyMove(userId, moveData, currentState) {
    const { word } = moveData;
    const wordScore = word.length; // Simple scoring: 1 point per letter

    const newScores = {
      ...currentState.scores,
      [userId]: (currentState.scores[userId] || 0) + wordScore,
    };

    return {
      ...currentState,
      scores: newScores,
      usedWords: [...currentState.usedWords, word.toUpperCase()],
    };
  }

  advanceRound(currentState) {
    if (currentState.currentRound >= currentState.totalRounds) {
      // Determine winner by score
      const winner = Object.entries(currentState.scores)
        .sort((a, b) => b[1] - a[1])[0][0];
      return {
        ...currentState,
        status: 'finished',
        winner,
      };
    }

    return {
      ...currentState,
      grid: this._generateGrid(),
      usedWords: [],
      currentRound: currentState.currentRound + 1,
      roundStartedAt: Date.now(),
    };
  }

  isFinished(currentState) {
    return currentState.status === 'finished';
  }

  calculateReward(currentState, userId) {
    if (currentState.winner === userId) return { result: 'WIN', xpEarned: 50 };
    return { result: 'LOSS', xpEarned: 10 };
  }

  getSpectatorState(currentState) {
    // Spectators see the grid and scores, NOT the usedWords
    return { ...currentState, usedWords: [] };
  }
}

module.exports = WordRushPlugin;
