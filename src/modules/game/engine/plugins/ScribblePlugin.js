'use strict';

const GamePlugin = require('../GamePlugin');

const ROUND_DURATION_MS = 80 * 1000;
const ROUNDS_PER_GAME = 4;

/**
 * Scribble Plugin
 *
 * Round flow:
 * 1. Server selects a secret word and sends it ONLY to the drawer.
 * 2. The drawer sends stroke paths (NOT full canvas frames).
 * 3. Guessers submit guesses; server validates against the secret word.
 * 4. First correct guesser gets max points; drawer gets points per correct guess.
 */
const WORD_POOL = [
  'ELEPHANT', 'BICYCLE', 'MOUNTAIN', 'UMBRELLA', 'COMPUTER',
  'DOLPHIN', 'GUITAR', 'TELESCOPE', 'PIZZA', 'ROCKET',
  'CASTLE', 'TORNADO', 'LIBRARY', 'SUBMARINE', 'CACTUS',
];

class ScribblePlugin extends GamePlugin {
  constructor(matchData) {
    super(matchData);
    this.players = matchData.players || [];
  }

  _pickWord(usedWords) {
    const available = WORD_POOL.filter(w => !usedWords.includes(w));
    return available[Math.floor(Math.random() * available.length)];
  }

  createState() {
    const scores = {};
    const turnOrder = this.players.map(p => p.userId);
    this.players.forEach(p => { scores[p.userId] = 0; });

    const word = this._pickWord([]);
    return {
      currentDrawerIndex: 0,
      turnOrder,
      secretWord: word,
      usedWords: [word],
      scores,
      currentRound: 1,
      totalRounds: ROUNDS_PER_GAME,
      roundStartedAt: Date.now(),
      correctGuessers: [],
      status: 'active',
      winner: null,
    };
  }

  onPlayerJoin(userId) {}
  onPlayerLeave(userId) {}
  onReconnect(userId) {}

  validateMove(userId, moveData, currentState) {
    // moveData can be:
    //   { type: 'STROKE', data: { points: [], color, width } }  — from drawer
    //   { type: 'GUESS', word: 'ELEPHANT' }                     — from guesser

    const currentDrawer = currentState.turnOrder[currentState.currentDrawerIndex];

    if (moveData.type === 'STROKE') {
      if (userId !== currentDrawer) {
        return { valid: false, reason: 'Only the drawer can draw' };
      }
      return { valid: true };
    }

    if (moveData.type === 'GUESS') {
      if (userId === currentDrawer) {
        return { valid: false, reason: 'Drawer cannot guess' };
      }
      if (currentState.correctGuessers.includes(userId)) {
        return { valid: false, reason: 'You already guessed correctly' };
      }
      return { valid: true };
    }

    return { valid: false, reason: 'Unknown move type' };
  }

  applyMove(userId, moveData, currentState) {
    if (moveData.type === 'STROKE') {
      // Strokes are just broadcast via WS; no state mutation needed
      return currentState;
    }

    if (moveData.type === 'GUESS') {
      const isCorrect = moveData.word.toUpperCase() === currentState.secretWord.toUpperCase();
      if (!isCorrect) return currentState;

      // Score: earlier guesses get more points
      const pointsForGuesser = Math.max(10, 100 - (currentState.correctGuessers.length * 20));
      const pointsForDrawer = 10;

      const drawer = currentState.turnOrder[currentState.currentDrawerIndex];
      const newScores = { ...currentState.scores };
      newScores[userId] = (newScores[userId] || 0) + pointsForGuesser;
      newScores[drawer] = (newScores[drawer] || 0) + pointsForDrawer;

      return {
        ...currentState,
        scores: newScores,
        correctGuessers: [...currentState.correctGuessers, userId],
      };
    }

    return currentState;
  }

  advanceRound(currentState) {
    const nextDrawerIndex = (currentState.currentDrawerIndex + 1) % currentState.turnOrder.length;
    const isLastRound =
      currentState.currentRound >= currentState.totalRounds &&
      nextDrawerIndex === 0;

    if (isLastRound) {
      const winner = Object.entries(currentState.scores)
        .sort((a, b) => b[1] - a[1])[0][0];
      return { ...currentState, status: 'finished', winner };
    }

    const nextWord = this._pickWord(currentState.usedWords);
    return {
      ...currentState,
      currentDrawerIndex: nextDrawerIndex,
      secretWord: nextWord,
      usedWords: [...currentState.usedWords, nextWord],
      currentRound: nextDrawerIndex === 0 ? currentState.currentRound + 1 : currentState.currentRound,
      correctGuessers: [],
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

  /**
   * Spectators see strokes but NOT the secret word.
   */
  getSpectatorState(currentState) {
    const { secretWord, ...safe } = currentState;
    return safe;
  }

  /**
   * State sent to the DRAWER contains the secret word.
   * State sent to GUESSERS does NOT.
   */
  getPlayerState(currentState, userId) {
    const drawer = currentState.turnOrder[currentState.currentDrawerIndex];
    if (userId === drawer) return currentState;
    const { secretWord, ...safe } = currentState;
    return safe;
  }
}

module.exports = ScribblePlugin;
