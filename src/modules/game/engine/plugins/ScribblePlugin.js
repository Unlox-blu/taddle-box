'use strict';

const GamePlugin = require('../GamePlugin');

const WORD_POOL = [
  'ELEPHANT', 'BICYCLE', 'MOUNTAIN', 'UMBRELLA', 'COMPUTER',
  'DOLPHIN', 'GUITAR', 'TELESCOPE', 'PIZZA', 'ROCKET',
  'CASTLE', 'TORNADO', 'LIBRARY', 'SUBMARINE', 'CACTUS',
];

/**
 * Scribble Plugin — ported to new architecture.
 *
 * canPlayerAct: drawer can draw, guessers can guess (simultaneous)
 * getTimers: returns round timer from config
 * applyMove: returns complete state
 */
class ScribblePlugin extends GamePlugin {
  static EXECUTION_MODEL = 'round-based';

  constructor(matchData) {
    super(matchData);
    this.players = matchData.players || [];
  }

  canPlayerAct(state, userId) {
    // Simultaneous: anyone can act (strokes and guesses)
    return true;
  }

  getTimers(state) {
    const config = this.configSnapshot || {};
    const roundTimeoutMs = config.roundTimeoutMs || 80000;

    return [{
      type: 'round',
      durationMs: roundTimeoutMs,
      jobData: { gameSlug: 'scribble' },
    }];
  }

  getCommandTimeoutMs() {
    return 500;
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
      totalRounds: 1,
      roundStartedAt: Date.now(),
      correctGuessers: [],
      guesses: [],
      status: 'active',
      winner: null,
    };
  }

  onPlayerJoin(userId) {}
  onPlayerLeave(userId) {}
  onReconnect(userId) {}
  cleanup() {}

  validateMove(userId, moveData, currentState) {
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
      return currentState; // Strokes broadcast via WS, no state mutation
    }

    if (moveData.type === 'GUESS') {
      const isCorrect = moveData.word.toUpperCase() === currentState.secretWord.toUpperCase();
      const guesses = [
        ...(currentState.guesses || []),
        {
          userId,
          text: String(moveData.word || '').trim().slice(0, 60),
          correct: isCorrect,
          ts: Date.now(),
        },
      ];
      if (!isCorrect) return { ...currentState, guesses };

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
        guesses,
      };
    }

    return currentState;
  }

  advanceRound(currentState) {
    const nextDrawerIndex = (currentState.currentDrawerIndex + 1) % currentState.turnOrder.length;
    const isLastRound =
      currentState.currentRound >= currentState.totalRounds && nextDrawerIndex === 0;

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
      guesses: [],
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
    const { secretWord, ...safe } = currentState;
    return safe;
  }

  getPlayerState(state, userId) {
    const drawer = state.turnOrder[state.currentDrawerIndex];
    const drawerId = drawer;

    if (userId === drawer) {
      // Drawer sees the actual word
      return { ...state, word: state.secretWord, wordMask: null, drawerId };
    }

    // Guesser: progressive word reveal (letters appear over time)
    const elapsed = Date.now() - (state.roundStartedAt || Date.now());
    const revealCount = elapsed > 30000 ? 1 + Math.floor((elapsed - 30000) / 15000) : 0;
    const wordMask = state.secretWord
      ? state.secretWord.split('').map((c, i) => (i < revealCount ? c : '_')).join(' ')
      : null;

    const { secretWord, ...safe } = state;
    return { ...safe, wordMask, drawerId };
  }
}

module.exports = ScribblePlugin;
