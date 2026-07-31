'use strict';

const EventStore = require('./EventStore');
const TimerEngine = require('./TimerEngine');
const GameRegistry = require('./GameRegistry');

/**
 * Match Lifecycle States
 */
const MATCH_STATES = {
  WAITING: 'WAITING',
  READY: 'READY',
  STARTING: 'STARTING',
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  FINISHED: 'FINISHED',
  ARCHIVED: 'ARCHIVED'
};

class MatchManager {
  /**
   * Start or Resume a match
   */
  static async loadOrInitializeMatch(matchId, gameSlug, matchMetadata) {
    let state = await EventStore.loadMatchSnapshot(matchId);
    
    const plugin = GameRegistry.createInstance(gameSlug, matchMetadata);

    if (!state) {
      // Initialize new match — store the correct player count from metadata
      state = {
        status: MATCH_STATES.WAITING,
        players: matchMetadata.players || [],
        maxPlayers: matchMetadata.maxPlayers || matchMetadata.players?.length || 2,
        pluginState: plugin.createState(),
        metadata: matchMetadata,
        startedAt: null,
        readyPlayers: [],
      };
      await EventStore.saveMatchSnapshot(matchId, state);
      await EventStore.appendEvent(matchId, { type: 'INIT_MATCH', state });
    }

    return { state, plugin };
  }

  static async handlePlayerJoin(matchId, gameSlug, userId) {
    const { state, plugin } = await this.loadOrInitializeMatch(matchId, gameSlug, {});
    
    // Add player logic...
    plugin.onPlayerJoin(userId);
    
    // Auto-transition to READY if enough players
    if (state.status === MATCH_STATES.WAITING && state.players.length >= (state.metadata.maxPlayers || 2)) {
      state.status = MATCH_STATES.READY;
    }
    
    await EventStore.saveMatchSnapshot(matchId, state);
    return state;
  }

  static async handlePlayerMove(matchId, gameSlug, userId, moveData) {
    const { state, plugin } = await this.loadOrInitializeMatch(matchId, gameSlug, {});

    if (state.status !== MATCH_STATES.ACTIVE) {
      throw new Error(`Match is not active. Current state: ${state.status}`);
    }

    // Delegate validation and application to the plugin
    if (!plugin.validateMove(userId, moveData, state.pluginState)) {
      throw new Error('Invalid move');
    }

    state.pluginState = plugin.applyMove(userId, moveData, state.pluginState);

    // Check if game is finished
    if (plugin.isFinished(state.pluginState)) {
      state.status = MATCH_STATES.FINISHED;
      TimerEngine.clearAllTimers(matchId);
      await EventStore.appendEvent(matchId, { type: 'GAME_OVER', result: state.pluginState });
    } else {
      await EventStore.appendEvent(matchId, { type: 'MOVE', userId, moveData });
    }

    await EventStore.saveMatchSnapshot(matchId, state);
    return state;
  }
}

module.exports = { MatchManager, MATCH_STATES };
