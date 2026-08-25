'use strict';

/**
 * StateDiff — delta compression for game state SYNC events.
 *
 * Instead of sending full state every move, compute the diff between
 * previous and current state and only send changed fields.
 *
 * Uses `socket.lastProjectedRevision` to track what each player has seen.
 */

class StateDiff {
  /**
   * Compare two state objects and return only changed keys.
   * Returns null if no changes (caller should skip the emit).
   *
   * @param {Object} oldState  previous projected state for this player
   * @param {Object} newState  current projected state for this player
   * @returns {Object|null}    diff object with only changed keys, or null
   */
  static diff(oldState, newState) {
    if (!oldState) return { full: newState };
    if (!newState) return null;

    const changes = {};
    const allKeys = new Set([...Object.keys(oldState), ...Object.keys(newState)]);

    for (const key of allKeys) {
      const oldVal = JSON.stringify(oldState[key]);
      const newVal = JSON.stringify(newState[key]);
      if (oldVal !== newVal) {
        changes[key] = newState[key];
      }
    }

    return Object.keys(changes).length > 0 ? changes : null;
  }

  /**
   * Apply a patch to a state object.
   * If patch.full is set, replace entirely. Otherwise merge changes.
   *
   * @param {Object} state  current state
   * @param {Object} patch  diff from diff()
   * @returns {Object}      patched state
   */
  static patch(state, patch) {
    if (patch.full) return patch.full;
    return { ...state, ...patch };
  }

  /**
   * Compute diff and emit to a socket.
   * Tracks lastProjectedRevision to avoid sending redundant updates.
   *
   * @param {Object} socket     Socket.IO socket
   * @param {Object} projected  full projected view for this player
   * @param {string} eventType  event name (e.g. 'SYNC')
   * @param {Object} extraData  additional data to include in the emit
   * @returns {boolean}         true if an emit was sent
   */
  static emitDiff(socket, projected, eventType, extraData = {}) {
    const previousProjected = socket._lastProjectedView || {};
    const diff = this.diff(previousProjected, projected);

    if (!diff) return false;

    socket.emit(eventType, {
      state: diff,
      patch: true,
      ...extraData,
    });

    socket._lastProjectedView = this.patch(previousProjected, diff);
    if (extraData.stateRevision != null) {
      socket.lastProjectedRevision = extraData.stateRevision;
    }

    return true;
  }
}

module.exports = StateDiff;
