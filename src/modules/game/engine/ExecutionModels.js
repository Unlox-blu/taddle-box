'use strict';

/**
 * Execution Models — defines HOW the server orchestrates game turns.
 *
 * Three clean, non-overlapping concepts:
 *   runtimeType    WHERE the runtime lives          'app' | 'web'
 *   runtime        WHICH client runtime renders it  'board-v1', 'reaction-v1', ...
 *   executionModel HOW the server orchestrates       'turn-based', 'real-time', 'round-based', 'simultaneous'
 *
 * The backend doesn't need to care whether the client is WebView or React Native.
 */

const EXECUTION_MODELS = {
  TURN_BASED: 'turn-based',       // Chess, Ludo, SnakeLadder
  REAL_TIME: 'real-time',         // TapRush
  ROUND_BASED: 'round-based',    // WordRush, Scribble
  SIMULTANEOUS: 'simultaneous',  // MemoryGrid (both flip at once)
};

module.exports = EXECUTION_MODELS;
