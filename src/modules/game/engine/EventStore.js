'use strict';

/**
 * EventStore — single source of truth for match state and events.
 *
 * Architecture:
 *   PostgreSQL = durable SSOT for state snapshots, events, commands, outbox
 *   Redis       = fast accelerator for hot state reads + duplicate detection
 *
 * Core invariant:
 *   one command → one state transition → one event sequence → one durable TX
 *
 * Redis is the accelerator, not the ultimate source of truth.
 */

const crypto = require('crypto');
const pool   = require('../../../config/database');
const redis  = require('../../../config/redis');

// ── Bot UUID mapping ────────────────────────────────────────────────────
// Bot IDs (e.g. "bot_002_e3eb9a02_0") are not valid UUIDs, but the
// game_commands.user_id column is UUID. This helper generates a
// deterministic UUID from any bot ID string using SHA-256, so the same
// bot always maps to the same UUID in the database.
const BOT_UUID_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
function botIdToUuid(botId) {
  if (!botId) return null;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(botId)) {
    return botId;
  }
  const hash = crypto.createHash('sha256').update(BOT_UUID_NAMESPACE + botId).digest('hex');
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    '5' + hash.slice(13, 16),
    hash.slice(16, 20),
    hash.slice(20, 32),
  ].join('-');
}
// ── Lua scripts ─────────────────────────────────────────────────────────
// Atomic INCR + EXPIRE for rate limiting
const RATE_LIMIT_LUA = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local current = redis.call('INCR', key)
if current == 1 then
  redis.call('EXPIRE', key, window)
end
if current > limit then
  return 0
end
return 1
`;

// Atomic SET NX EX for command deduplication
const COMMAND_DEDUP_LUA = `
local key = KEYS[1]
local ttl = tonumber(ARGV[1])
local result = redis.call('SET', key, 'PROCESSING', 'NX', 'EX', ttl)
return result and 1 or 0
`;

class EventStore {

  // ── Rate limiter (atomic via Lua) ─────────────────────────────────────
  /**
   * Returns true if the request is allowed, false if rate-limited.
   * Uses a fixed-window counter with atomic INCR+EXPIRE.
   */
  static async checkRateLimit(userId, action, limit, windowSec) {
    const key = `ratelimit:${action}:${userId}`;
    const result = await redis.eval(RATE_LIMIT_LUA, 1, key, limit, windowSec);
    return result === 1;
  }

  // ── Command deduplication (Redis fast path + PostgreSQL durable path) ─
  /**
   * Attempt to reserve a command. Returns:
   *   'RESERVED'  — new command, caller should process it
   *   'DUPLICATE' — command already exists (same commandId), return cached result
   *   'PROCESSING'— command is currently being processed by another actor
   */
  static async reserveCommand(matchId, commandId, userId, commandType, ttlSec = 300) {
    // Fast path: Redis atomic SET NX
    const redisKey = `cmd:${matchId}:${commandId}`;
    const acquired = await redis.eval(COMMAND_DEDUP_LUA, 1, redisKey, ttlSec);

    if (acquired === 0) {
      // Either DUPLICATE or PROCESSING — check PostgreSQL for the truth
      const { rows } = await pool.query(
        `SELECT status, result, error_message
         FROM game_commands
         WHERE match_id = $1 AND command_id = $2`,
        [matchId, commandId]
      );
      if (rows.length > 0) {
        return {
          status: rows[0].status,
          result: rows[0].result,
          error: rows[0].error_message,
        };
      }
      // Redis had a stale key but PG has nothing — treat as PROCESSING
      return { status: 'PROCESSING' };
    }

    // Reserved — insert the command row in PG
    // Convert bot IDs (non-UUID strings) to deterministic UUIDs for the DB.
    const dbUserId = botIdToUuid(userId);
    const { rows } = await pool.query(
      `INSERT INTO game_commands (match_id, command_id, user_id, command_type, state_revision, status)
       VALUES ($1, $2, $3, $4, 0, 'PROCESSING')
       ON CONFLICT (match_id, command_id) DO UPDATE
         SET status = 'PROCESSING', updated_at = NOW()
       RETURNING id, state_revision`,
      [matchId, commandId, dbUserId, commandType]
    );

    return { status: 'RESERVED', commandDbId: rows[0]?.id };
  }

  /**
   * Mark a command as completed with its result.
   */
  static async completeCommand(matchId, commandId, result, stateRevision) {
    const redisKey = `cmd:${matchId}:${commandId}`;
    await pool.query(
      `UPDATE game_commands
       SET status = 'COMPLETED', result = $1::jsonb, completed_at = NOW(), state_revision = $2
       WHERE match_id = $3 AND command_id = $4`,
      [JSON.stringify(result || {}), stateRevision, matchId, commandId]
    );
    // Keep Redis key alive so fast duplicate detection still works
    await redis.set(redisKey, 'COMPLETED', 'EX', 600);
  }

  /**
   * Mark a command as failed.
   */
  static async failCommand(matchId, commandId, errorMessage, stateRevision) {
    const redisKey = `cmd:${matchId}:${commandId}`;
    await pool.query(
      `UPDATE game_commands
       SET status = 'FAILED', error_message = $1, completed_at = NOW(), state_revision = $2
       WHERE match_id = $3 AND command_id = $4`,
      [errorMessage, stateRevision, matchId, commandId]
    );
    await redis.set(redisKey, 'FAILED', 'EX', 600);
  }

  // ── Match snapshot ────────────────────────────────────────────────────
  /**
   * Save match snapshot to BOTH PostgreSQL (durable) and Redis (hot cache).
   * PostgreSQL is the SSOT; Redis is the accelerator.
   */
  static async saveMatchSnapshot(matchId, snapshotData, clientOrPool = pool) {
    const serialized = JSON.stringify(snapshotData);
    const revision = snapshotData.currentRevision || 0;

    // PostgreSQL: durable SSOT
    await clientOrPool.query(
      `UPDATE game_matches
       SET state_snapshot = $1::jsonb, current_revision = $2, updated_at = NOW()
       WHERE id = $3`,
      [serialized, revision, matchId]
    );

    // Redis: hot cache with TTL
    const key = `match:${matchId}:state`;
    await redis.set(key, serialized, 'EX', 3600 * 24);
  }

  /**
   * Load match snapshot. Prefers Redis hot cache; falls back to PostgreSQL.
   */
  static async loadMatchSnapshot(matchId) {
    // Fast path: Redis
    const key = `match:${matchId}:state`;
    const data = await redis.get(key);
    if (data) return JSON.parse(data);

    // Slow path: PostgreSQL
    const { rows } = await pool.query(
      `SELECT state_snapshot, current_revision
       FROM game_matches
       WHERE id = $1`,
      [matchId]
    );
    if (rows[0]?.state_snapshot) {
      const snap = typeof rows[0].state_snapshot === 'string'
        ? JSON.parse(rows[0].state_snapshot)
        : rows[0].state_snapshot;
      // Warm the Redis cache
      await redis.set(key, JSON.stringify(snap), 'EX', 3600 * 24);
      return snap;
    }
    return null;
  }

  /**
   * Load snapshot for crash recovery rehydration.
   * Returns { snapshot, revision, events } where events are post-snapshot.
   */
  static async loadForRecovery(matchId) {
    const { rows: matchRows } = await pool.query(
      `SELECT state_snapshot, snapshot_revision, current_revision
       FROM game_matches
       WHERE id = $1`,
      [matchId]
    );
    const match = matchRows[0];
    if (!match) return null;

    const snapshot = match.state_snapshot
      ? (typeof match.state_snapshot === 'string' ? JSON.parse(match.state_snapshot) : match.state_snapshot)
      : null;

    const fromSeq = (match.snapshot_revision || 0) + 1;
    const { rows: eventRows } = await pool.query(
      `SELECT sequence_number, event_type, payload, user_id, created_at
       FROM game_events
       WHERE match_id = $1 AND sequence_number >= $2
       ORDER BY sequence_number ASC`,
      [matchId, fromSeq]
    );

    return {
      snapshot,
      snapshotRevision: match.snapshot_revision || 0,
      currentRevision: match.current_revision || 0,
      events: eventRows,
    };
  }

  // ── Event log (immutable append-only) ─────────────────────────────────
  /**
   * Append an event to the immutable event log.
   * Returns the allocated sequence_number (allocated exclusively by the actor).
   */
  static async appendEvent(matchId, eventType, payload, userId = null, sequenceNumber) {
    // Convert bot IDs to deterministic UUIDs for the DB.
    const dbUserId = userId ? botIdToUuid(userId) : null;
    const { rows } = await pool.query(
      `INSERT INTO game_events (match_id, sequence_number, event_type, payload, user_id)
       VALUES ($1, $2, $3, $4::jsonb, $5)
       ON CONFLICT (match_id, sequence_number) DO UPDATE
         SET event_type = EXCLUDED.event_type, payload = EXCLUDED.payload
       RETURNING id, sequence_number`,
      [matchId, sequenceNumber, eventType, JSON.stringify(payload || {}), dbUserId]
    );
    return rows[0];
  }

  /**
   * Get all events for a match (ordered). Useful for replay or debugging.
   */
  static async getEvents(matchId, fromSequence = 0) {
    const { rows } = await pool.query(
      `SELECT sequence_number, event_type, payload, user_id, created_at
       FROM game_events
       WHERE match_id = $1 AND sequence_number >= $2
       ORDER BY sequence_number ASC`,
      [matchId, fromSequence]
    );
    return rows;
  }

  // ── Outbox (delivery mechanism, NOT the event log) ────────────────────
  /**
   * Publish events to the outbox for downstream services (XP, analytics…).
   * Uses atomic UPDATE ... FOR UPDATE SKIP LOCKED for exactly-once claiming.
   */
  static async publishToOutbox(matchId, eventType, payload) {
    await pool.query(
      `INSERT INTO event_outbox (match_id, event_type, payload)
       VALUES ($1, $2, $3::jsonb)`,
      [matchId, eventType, JSON.stringify(payload || {})]
    );
  }

  /**
   * Claim pending outbox events for a worker.
   * Uses atomic UPDATE + RETURNING for exactly-once claiming.
   */
  static async claimOutboxEvents(batchSize = 10, leaseMs = 30000) {
    const { rows } = await pool.query(`
      WITH claimed AS (
        SELECT id
        FROM event_outbox
        WHERE status = 'PENDING'
          AND (next_retry_at IS NULL OR next_retry_at <= NOW())
          AND attempt_count < max_attempts
        ORDER BY created_at ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED
      )
      UPDATE event_outbox o
      SET status = 'PROCESSING',
          locked_at = NOW() + ($2 || ' milliseconds')::interval,
          attempt_count = attempt_count + 1
      FROM claimed c
      WHERE o.id = c.id
      RETURNING o.id, o.match_id, o.event_type, o.payload, o.attempt_count
    `, [batchSize, String(leaseMs)]);
    return rows;
  }

  /**
   * Mark an outbox event as processed.
   */
  static async markOutboxProcessed(eventId) {
    await pool.query(
      `UPDATE event_outbox
       SET status = 'PROCESSED', processed_at = NOW()
       WHERE id = $1`,
      [eventId]
    );
  }

  /**
   * Mark an outbox event as failed (for retry or permanent failure).
   */
  static async markOutboxFailed(eventId, retryable = true) {
    await pool.query(
      `UPDATE event_outbox
       SET status = CASE WHEN attempt_count >= max_attempts THEN 'FAILED' ELSE 'PENDING' END,
           locked_at = NULL,
           next_retry_at = CASE WHEN attempt_count < max_attempts
                             THEN NOW() + (attempt_count * 5 || ' seconds')::interval
                             ELSE NULL END
       WHERE id = $1`,
      [eventId]
    );
  }

  /**
   * Reclaim stale outbox events (PROCESSING longer than lease).
   */
  static async reclaimStaleOutboxEvents(leaseMs = 30000) {
    const { rows } = await pool.query(`
      UPDATE event_outbox
      SET status = 'PENDING', locked_at = NULL, next_retry_at = NULL
      WHERE status = 'PROCESSING'
        AND locked_at < NOW() - ($1 || ' milliseconds')::interval
      RETURNING id
    `, [String(leaseMs)]);
    return rows.length;
  }

  // ── Snapshot checkpointing ────────────────────────────────────────────
  /**
   * Write a checkpoint snapshot. After this, recovery only needs events
   * with sequence_number > snapshotRevision.
   */
  static async writeCheckpoint(matchId, snapshot, currentRevision, clientOrPool = pool) {
    await clientOrPool.query(
      `UPDATE game_matches
       SET state_snapshot = $1::jsonb,
           snapshot_revision = $2,
           current_revision = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [JSON.stringify(snapshot), currentRevision, matchId]
    );
    // Warm Redis
    const key = `match:${matchId}:state`;
    await redis.set(key, JSON.stringify(snapshot), 'EX', 3600 * 24);
  }

  // ── Cleanup ───────────────────────────────────────────────────────────
  /**
   * Clean up Redis cache for a match (after archiving to PostgreSQL).
   */
  static async cleanupMatch(matchId) {
    const stateKey  = `match:${matchId}:state`;
    const eventsKey = `match:${matchId}:events`;
    const timersKey = `match:${matchId}:timers`;
    await redis.del(stateKey, eventsKey, timersKey);
  }

  /**
   * Hot state cache for active matches (fast path for socket reads).
   */
  static async getHotState(matchId) {
    const key = `match:${matchId}:state`;
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  /**
   * Set hot state in Redis.
   */
  static async setHotState(matchId, state, ttlSec = 3600 * 24) {
    const key = `match:${matchId}:state`;
    await redis.set(key, JSON.stringify(state), 'EX', ttlSec);
  }
}

module.exports = EventStore;
module.exports.botIdToUuid = botIdToUuid;
