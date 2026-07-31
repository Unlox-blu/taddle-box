'use strict';

/**
 * Base abstract class that all game plugins must inherit from.
 */
class GamePlugin {
  constructor(matchData) {
    this.matchData = matchData;
  }

  // --- Core Lifecycle Hooks ---

  /**
   * Initialize a new match state.
   */
  createState() {
    throw new Error('createState() must be implemented by the game plugin');
  }

  /**
   * Called when a player joins the match for the first time.
   */
  onPlayerJoin(userId) {}

  /**
   * Called when a player leaves the match.
   */
  onPlayerLeave(userId) {}

  /**
   * Called when a player reconnects.
   */
  onReconnect(userId) {}

  /**
   * Called when a timer times out (turn, round, etc.).
   */
  onTimeout(type) {}

  /**
   * Cleanup resources before the match is archived.
   */
  cleanup() {}

  // --- Mechanics Hooks ---

  /**
   * Validate if a move is legal for the current state.
   */
  validateMove(userId, moveData, currentState) {
    throw new Error('validateMove() must be implemented by the game plugin');
  }

  /**
   * Apply a validated move and return the new state.
   */
  applyMove(userId, moveData, currentState) {
    throw new Error('applyMove() must be implemented by the game plugin');
  }

  /**
   * Check if the game has reached a terminal state (win/loss/draw).
   */
  isFinished(currentState) {
    throw new Error('isFinished() must be implemented by the game plugin');
  }

  /**
   * Calculate XP/Rewards based on the final state.
   */
  calculateReward(currentState, userId) {
    throw new Error('calculateReward() must be implemented by the game plugin');
  }

  // --- Serialization ---

  /**
   * Optional: Format state for persistence (if custom encoding needed).
   */
  serialize(currentState) {
    return currentState;
  }

  /**
   * Optional: Restore state from persistence.
   */
  deserialize(serializedState) {
    return serializedState;
  }

  /**
   * Return a sanitized state suitable for spectators.
   */
  getSpectatorState(currentState) {
    return currentState;
  }
}

module.exports = GamePlugin;
