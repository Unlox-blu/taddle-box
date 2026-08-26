'use strict';

/**
 * MatchManager — per-match actor with serial command processing.
 *
 * Architecture:
 *   - Each match has an in-memory actor (Map<matchId, Actor>)
 *   - Commands are enqueued and processed serially by the actor
 *   - No distributed lock needed — the actor IS the single writer
 *   - PostgreSQL is the durable SSOT; Redis is the hot cache
 *   - Commands are reserved in PG atomically before processing
 *   - Snapshots are checkpointed periodically (every N events)
 *
 * Core invariant:
 *   one command → one state transition → one event sequence → one durable TX
 */


const EventStore = require('./EventStore');
const GameRegistry = require('./GameRegistry');

// ── Match Lifecycle States ────────────────────────────────────────────────
const MATCH_STATES = {
  WAITING: 'WAITING',
  READY: 'READY',
  STARTING: 'STARTING',
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  FINISHED: 'FINISHED',
  ARCHIVED: 'ARCHIVED',
};

// ── Checkpoint every N events ─────────────────────────────────────────────
const CHECKPOINT_INTERVAL = 50;

// ── Max command execution timeout (ms) ────────────────────────────────────
const GLOBAL_MAX_COMMAND_MS = 2000;

// ═══════════════════════════════════════════════════════════════════════════
// Per-Match Actor
// ═══════════════════════════════════════════════════════════════════════════

class MatchActor {
  constructor(matchId) {
    this.matchId = matchId;
    this.state = null;       // full match state (with pluginState, metadata, etc.)
    this.plugin = null;      // game plugin instance
    this.commandQueue = [];
    this.processing = false;
    this.currentRevision = 0;
    this.eventCount = 0;
  }

  /**
   * Enqueue a command for serial processing.
   * Returns a promise that resolves with the full match state.
   */
  enqueue(command) {
    return new Promise((resolve, reject) => {
      this.commandQueue.push({ command, resolve, reject });
      this._drain();
    });
  }

  async _drain() {
    if (this.processing || this.commandQueue.length === 0) return;
    this.processing = true;

    while (this.commandQueue.length > 0) {
      const { command, resolve, reject } = this.commandQueue.shift();
      try {
        const result = await this._processCommand(command);
        resolve(result);
      } catch (err) {
        reject(err);
      }
    }

    this.processing = false;
  }

  async _processCommand(command) {
    const { type, matchId, commandId, userId, gameSlug, moveData } = command;

    // Reserve the command (atomic dedup in PG)
    const reservation = await EventStore.reserveCommand(matchId, commandId, userId, type);
    if (reservation.status === 'COMPLETED') {
      return { status: 'DUPLICATE', result: reservation.result, ...this.state };
    }
    if (reservation.status === 'FAILED') {
      return { status: 'DUPLICATE', error: reservation.error, ...this.state };
    }
    if (reservation.status === 'PROCESSING') {
      return { status: 'PROCESSING', ...this.state };
    }

    // Execute the command with timeout
    const timeoutMs = this.plugin?.getCommandTimeoutMs() || GLOBAL_MAX_COMMAND_MS;

    try {
      const newState = await this._executeWithTimeout(
        () => this._executeCommand(type, matchId, userId, gameSlug, moveData),
        timeoutMs
      );

      // Mark command completed atomically
      await EventStore.completeCommand(matchId, commandId, newState, this.currentRevision);
      return newState;
    } catch (err) {
      await EventStore.failCommand(matchId, commandId, err.message, this.currentRevision);
      throw err;
    }
  }

  _executeWithTimeout(fn, ms) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Command timeout after ${ms}ms`)), ms);
      fn()
        .then(result => { clearTimeout(timer); resolve(result); })
        .catch(err => { clearTimeout(timer); reject(err); });
    });
  }

  /**
   * Core execution: validate → apply → record event → save snapshot.
   * All inside a PostgreSQL transaction for atomicity.
   *
   * The plugin is authoritative:
   *   1. plugin.validateMove() — is this legal?
   *   2. plugin.applyMove()    — produce new complete state
   *   3. Record event + snapshot atomically
   *
   * Returns the FULL match state (not just pluginState).
   */
  async _executeCommand(type, matchId, userId, gameSlug, moveData) {
    if (!this.plugin || !this.state) {
      throw new Error('Actor not initialized for this match');
    }

    // ── Step 1: Validate ──────────────────────────────────────────────
    const validation = this.plugin.validateMove(userId, moveData, this.state.pluginState);
    if (!validation.valid) {
      throw new Error(validation.reason || 'Invalid move');
    }

    // ── Step 2: Apply (plugin-authoritative) ──────────────────────────
    const newPluginState = this.plugin.applyMove(userId, moveData, this.state.pluginState);

    // ── Step 3: Check terminal ────────────────────────────────────────
    const finished = this.plugin.isFinished(newPluginState);

    // ── Step 4: Atomic PostgreSQL transaction ─────────────────────────
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Allocate sequence number exclusively (inside actor, so deterministic)
      this.currentRevision += 1;
      const seq = this.currentRevision;

      // Record state revision on the full match state
      this.state.pluginState = newPluginState;
      this.state.currentRevision = seq;

      if (finished) {
        this.state.status = MATCH_STATES.FINISHED;
      }

      // Append event atomically
      await client.query(
        `INSERT INTO game_events (match_id, sequence_number, event_type, payload, user_id)
         VALUES ($1, $2, $3, $4::jsonb, $5)
         ON CONFLICT (match_id, sequence_number) DO UPDATE
           SET event_type = EXCLUDED.event_type, payload = EXCLUDED.payload`,
        [matchId, seq, type, JSON.stringify(moveData || {}), userId]
      );

      // Update match revision + snapshot
      await client.query(
        `UPDATE game_matches
         SET state_snapshot = $1::jsonb, current_revision = $2, updated_at = NOW()
         WHERE id = $3`,
        [JSON.stringify(this.state), seq, matchId]
      );

      // Publish to outbox for downstream services
      await client.query(
        `INSERT INTO event_outbox (match_id, event_type, payload)
         VALUES ($1, $2, $3::jsonb)`,
        [matchId, type, JSON.stringify({ ...moveData, sequenceNumber: seq, userId })]
      );

      // Checkpoint snapshot periodically
      this.eventCount += 1;
      if (this.eventCount % CHECKPOINT_INTERVAL === 0) {
        await client.query(
          `UPDATE game_matches
           SET snapshot_revision = $1
           WHERE id = $2`,
          [seq, matchId]
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // Also persist to Redis hot cache (outside the PG transaction)
    await EventStore.setHotState(matchId, this.state);

    return this.state;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MatchManager (singleton actor registry)
// ═══════════════════════════════════════════════════════════════════════════

const pool = require('../../../config/database');

class MatchManager {
  static actors = new Map(); // matchId → MatchActor

  /**
   * Get or create the actor for a match.
   */
  static getOrCreateActor(matchId) {
    if (!this.actors.has(matchId)) {
      this.actors.set(matchId, new MatchActor(matchId));
    }
    return this.actors.get(matchId);
  }

  /**
   * Get the actor for a match (null if not active).
   */
  static getActor(matchId) {
    return this.actors.get(matchId) || null;
  }

  /**
   * Remove the actor for a match (after archival).
   */
  static removeActor(matchId) {
    const actor = this.actors.get(matchId);
    if (actor) {
      actor.commandQueue.length = 0;
      this.actors.delete(matchId);
    }
  }

  /**
   * Rehydrate a match from PostgreSQL after crash recovery.
   * Rebuilds the actor with snapshot + replay events.
   */
  static async rehydrateMatch(matchId, gameSlug) {
    const recovery = await EventStore.loadForRecovery(matchId);
    if (!recovery || !recovery.snapshot) return null;

    const actor = this.getOrCreateActor(matchId);
    actor.state = recovery.snapshot;
    actor.currentRevision = recovery.currentRevision;
    actor.plugin = GameRegistry.createInstance(gameSlug, {
      ...recovery.snapshot.metadata,
      configSnapshot: recovery.snapshot.configSnapshot,
    });

    // Replay events from snapshot
    for (const event of recovery.events) {
      actor.currentRevision = event.sequence_number;
    }

    return actor;
  }

  // ── Public API ────────────────────────────────────────────────────────

  static async loadOrInitializeMatch(matchId, gameSlug, matchMetadata) {
    let state = await EventStore.loadMatchSnapshot(matchId);

    const effectiveMetadata = state ? state.metadata : matchMetadata;
    const plugin = GameRegistry.createInstance(gameSlug, effectiveMetadata);

    if (!state) {
      state = {
        status: MATCH_STATES.WAITING,
        players: matchMetadata.players || [],
        maxPlayers: matchMetadata.maxPlayers || matchMetadata.players?.length || 2,
        pluginState: plugin.createState(),
        metadata: matchMetadata,
        configSnapshot: matchMetadata.configSnapshot || {},
        configured_rounds: matchMetadata.configuredRounds || 1,
        current_round_number: 1,
        startedAt: null,
        readyPlayers: [],
        currentRevision: 0,
      };
      await EventStore.saveMatchSnapshot(matchId, state);
    }

    // Ensure actor is initialized
    const actor = this.getOrCreateActor(matchId);
    actor.state = state;
    actor.plugin = plugin;
    actor.currentRevision = state.currentRevision || 0;

    return { state, plugin };
  }

  static async handlePlayerJoin(matchId, gameSlug, userId) {
    const { state, plugin } = await this.loadOrInitializeMatch(matchId, gameSlug, {});

    plugin.onPlayerJoin(userId);

    if (state.status === MATCH_STATES.WAITING && state.players.length >= (state.metadata.maxPlayers || 2)) {
      state.status = MATCH_STATES.READY;
    }

    const actor = this.getOrCreateActor(matchId);
    actor.state = state;
    await EventStore.saveMatchSnapshot(matchId, state);
    return state;
  }

  /**
   * Process a player move through the actor's serial queue.
   * Returns a promise that resolves with the FULL match state.
   */
  static handlePlayerMove(matchId, gameSlug, userId, moveData, commandId) {
    const actor = this.getOrCreateActor(matchId);

    // Ensure actor has state loaded
    if (!actor.state) {
      return this._loadAndEnqueue(actor, matchId, gameSlug, userId, moveData, commandId);
    }

    return actor.enqueue({
      type: moveData.type || 'MOVE',
      matchId,
      commandId: commandId || require('crypto').randomUUID(),
      userId,
      gameSlug,
      moveData,
    });
  }

  static async _loadAndEnqueue(actor, matchId, gameSlug, userId, moveData, commandId) {
    const { state, plugin } = await this.loadOrInitializeMatch(matchId, gameSlug, {});
    actor.state = state;
    actor.plugin = plugin;

    return actor.enqueue({
      type: moveData.type || 'MOVE',
      matchId,
      commandId: commandId || require('crypto').randomUUID(),
      userId,
      gameSlug,
      moveData,
    });
  }

  /**
   * Start or overwrite a timer for a match.
   */
  static async startTimer(matchId, type, ms, jobData) {
    const TimerEngine = require('./TimerEngine');
    await TimerEngine.startTimer(matchId, type, ms, jobData);
  }

  /**
   * Clear a timer for a match.
   */
  static async clearTimer(matchId, type) {
    const TimerEngine = require('./TimerEngine');
    await TimerEngine.clearTimer(matchId, type);
  }

  /**
   * Clear all timers for a match.
   */
  static async clearAllTimers(matchId) {
    const TimerEngine = require('./TimerEngine');
    await TimerEngine.clearAllTimers(matchId);
  }
}

module.exports = { MatchManager, MATCH_STATES };
