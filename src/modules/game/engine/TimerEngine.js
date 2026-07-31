'use strict';

/**
 * Timer Engine for managing generic timeouts (turn, round, reconnect, game).
 */
class TimerEngine {
  constructor() {
    this.timers = new Map();
  }

  /**
   * Start or overwrite a timer for a specific match.
   * @param {string} matchId 
   * @param {string} type e.g., 'turn', 'round', 'reconnect', 'game'
   * @param {number} ms 
   * @param {Function} callback 
   */
  startTimer(matchId, type, ms, callback) {
    this.clearTimer(matchId, type);

    const key = `${matchId}:${type}`;
    const timeoutId = setTimeout(() => {
      this.timers.delete(key);
      callback();
    }, ms);

    this.timers.set(key, timeoutId);
  }

  /**
   * Clear a specific timer for a match.
   * @param {string} matchId 
   * @param {string} type 
   */
  clearTimer(matchId, type) {
    const key = `${matchId}:${type}`;
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key));
      this.timers.delete(key);
    }
  }

  /**
   * Clear all timers associated with a match (useful for GAME_OVER or archiving).
   * @param {string} matchId 
   */
  clearAllTimers(matchId) {
    for (const key of this.timers.keys()) {
      if (key.startsWith(`${matchId}:`)) {
        clearTimeout(this.timers.get(key));
        this.timers.delete(key);
      }
    }
  }
}

// Export as a singleton
module.exports = new TimerEngine();
