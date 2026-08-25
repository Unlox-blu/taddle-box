'use strict';

/**
 * Base abstract class that all game plugins must inherit from.
 *
 * Architecture contract:
 *   - Plugin is authoritative for ALL game-state mutations
 *   - Socket handler / MatchManager orchestrate — never mutate plugin state
 *   - Plugin determines: who can act, what timers exist, command timeouts
 *   - Plugin returns complete new state (never caller-mutated)
 *   - SECURITY_POLICY defines platform-enforced requirements
 *   - COMMAND_SCHEMAS define payload validation rules
 *
 * Canonical interface (the ONLY methods plugins override):
 *   createState()              — initialize match state
 *   onMatchStart(state)        — called when match transitions to ACTIVE
 *   validateMove(userId, moveData, currentState) — is this move legal?
 *   applyMove(userId, moveData, currentState)    — produce new complete state
 *   isFinished(state)          — terminal state check
 *   calculateReward(state, userId) — XP/reward calculation
 *   getPlayerState(state, userId)  — filtered view for one player (FAIL CLOSED)
 *   getSpectatorState(state)       — filtered view for spectators (no hidden info)
 *   canPlayerAct(state, userId)    — turn authority
 *   getTimers(state)               — timer definitions
 *   onTimerExpired(state, timerType, userId) — handle timer expiry
 *   getCommandTimeoutMs()          — max command execution time
 *   getBotColor(players)           — bot color assignment for this game
 *   isTurnBased()                  — whether this game is turn-based
 *
 * Core invariant:
 *   one command → one state transition → one event sequence → one durable TX
 */
class GamePlugin {
  // ── Identity ────────────────────────────────────────────────────────────
  static ID = 'unknown';
  static EXECUTION_MODEL = 'real-time'; // 'turn-based' | 'real-time' | 'round-based' | 'simultaneous'
  static VERSION = 1;
  static ENTRY_FEE_DEFAULT = 10;

  // ── Security Policy ─────────────────────────────────────────────────────
  // Platform-enforced. Engine validates BEFORE calling plugin.
  static SECURITY_POLICY = {
    serverAuthoritative: true,
    requiresPlayerView: true,
    requiresIdempotency: true,
    maxCommandRate: 10,
    maxPayloadBytes: 4096,
    allowSpectators: false,
    allowReconnect: true,
    rewardType: 'xp',
    maxStateSizeBytes: 65536,
    maxCommandsPerMatch: 50000,
  };

  // ── Command Schemas ─────────────────────────────────────────────────────
  // Each plugin overrides. Engine validates payloads BEFORE calling plugin.
  static COMMAND_SCHEMAS = {};

  constructor(matchData) {
    this.matchData = matchData;
    this.configSnapshot = matchData?.configSnapshot || null;
  }

  // ── Core Lifecycle Hooks ──────────────────────────────────────────────

  /** Initialize a new match state. Must include stateRevision: 0. */
  createState() {
    throw new Error('createState() must be implemented by the game plugin');
  }

  /** Called when all players are ready, match transitions to ACTIVE. */
  onMatchStart(state) { return state; }

  /** Check if the game has reached a terminal state. */
  isFinished(state) {
    throw new Error('isFinished() must be implemented by the game plugin');
  }

  /** Calculate XP/Rewards based on the final state. */
  calculateReward(state, userId) {
    throw new Error('calculateReward() must be implemented by the game plugin');
  }

  // ── Round Lifecycle (for multi-round games) ────────────────────────

  /**
   * Return the definition for a specific round.
   * Called by RoundManager when creating the next round.
   * Default: same config/assets as the match — override for per-round variation.
   *
   * @param {number} roundNumber - 1-indexed
   * @param {number} totalRounds - configured rounds for the match
   * @param {Object} matchState - current match state for context
   * @returns {{ config, assetSetId, assetManifestVersion }}
   */
  getRoundDefinition(roundNumber, totalRounds, matchState) {
    return {
      config: matchState?.configSnapshot || {},
      assetSetId: matchState?.assetSetId || null,
      assetManifestVersion: matchState?.assetManifestVersion || 1,
    };
  }

  /**
   * Return the result for a finished round.
   * Backend is authoritative — frontend displays, never calculates.
   *
   * @param {Object} state - final state of the round
   * @returns {{ winner, standings: [{ userId, roundScore, matchScore, position }] }}
   */
  getRoundResult(state) {
    return {
      winner: state?.winner || null,
      standings: [],
    };
  }

  /** Assert game invariant for test builds. */
  assertInvariants(state) {}

  // ── Command Handling (THE canonical interface) ────────────────────────

  /**
   * Validate a move without mutating state.
   * Return { valid: true } or { valid: false, reason: string }.
   */
  validateMove(userId, moveData, currentState) {
    if (!this.canPlayerAct(currentState, userId)) {
      return { valid: false, reason: 'Not your turn' };
    }
    return { valid: true };
  }

  /**
   * Execute a move and return the COMPLETE new state.
   * The caller MUST NOT mutate the returned state.
   */
  applyMove(userId, moveData, currentState) {
    throw new Error(`applyMove() must be implemented by ${this.constructor.ID}`);
  }

  // ── Turn Authority ────────────────────────────────────────────────────

  /**
   * Determine if a player is allowed to act right now.
   * Plugin is the authority — socket handler never checks turnOrder directly.
   */
  canPlayerAct(state, userId) {
    if (state.turnOrder && state.currentTurnIndex != null) {
      return state.turnOrder[state.currentTurnIndex] === userId;
    }
    return true;
  }

  /**
   * Whether this game is turn-based (chess, ludo, snake-ladder).
   * Used by socket handler to decide timer behavior and bot turn sequencing.
   */
  isTurnBased() {
    return this.constructor.EXECUTION_MODEL === 'turn-based';
  }

  // ── Bot Configuration ─────────────────────────────────────────────────

  /**
   * Assign a color to a bot joining this game.
   * Override in games with color assignment (chess, ludo, snake-ladder).
   * @param {Array} players — current player roster (each has { userId, color, isBot, ... })
   * @returns {string} the color to assign
   */
  getBotColor(players) {
    return 'blue';
  }

  // ── Timers ────────────────────────────────────────────────────────────

  /**
   * Return the list of active timers for this match state.
   * Plugin defines WHAT timers exist; socket handler manages LIFECYCLE.
   */
  getTimers(state) {
    return [];
  }

  /**
   * Handle a timer expiry. Plugin-authoritative.
   * Returns new state after timeout handling.
   */
  onTimerExpired(state, timerType, userId) {
    return state;
  }

  /** Maximum milliseconds a single command execution may take. */
  getCommandTimeoutMs() {
    return 500;
  }

  // ── Player Views ──────────────────────────────────────────────────────

  /**
   * Return state filtered for one player.
   * FAIL CLOSED: every plugin MUST implement this if it hides information.
   * Default returns the full state (for games with no hidden info).
   */
  getPlayerState(state, userId) {
    return state;
  }

  /**
   * Return state safe for spectators (no hidden info).
   * FAIL CLOSED if spectators are supported.
   * Default returns the full state.
   */
  getSpectatorState(state) {
    return state;
  }

  // ── Serialization ─────────────────────────────────────────────────────

  /** Optional: Format state for persistence. */
  serialize(state) { return state; }

  /** Optional: Restore state from persistence. */
  deserialize(blob) { return blob; }

  /** Optional: Return per-game resource limits. */
  getResourceLimits() {
    return {
      maxCommandExecutionMs: this.getCommandTimeoutMs(),
      maxStateSizeBytes: this.constructor.SECURITY_POLICY?.maxStateSizeBytes || 65536,
      maxEventPayloadBytes: 8192,
      maxCommandsPerMatch: this.constructor.SECURITY_POLICY?.maxCommandsPerMatch || 50000,
    };
  }
}

module.exports = GamePlugin;
