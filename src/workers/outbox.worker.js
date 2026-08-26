'use strict';

/**
 * Outbox Worker — processes event_outbox entries for downstream services.
 *
 * At-least-once delivery: workers claim events atomically via
 * UPDATE ... FOR UPDATE SKIP LOCKED, process them, then mark as PROCESSED.
 * Consumers must be idempotent.
 *
 * Stale events (PROCESSING longer than lease) are reclaimed periodically.
 */

const config = require('../config/app.config');
const { logger } = require('../middlewares/logger.middleware');
const EventStore = require('../modules/game/engine/EventStore');
const CircuitBreaker = require('../utils/circuitBreaker');

const BATCH_SIZE = 10;
const LEASE_MS = 30000;
const POLL_INTERVAL_MS = 2000;

// Circuit breaker: if the DB is unreachable, back off instead of spamming
// connection attempts every 2 seconds.
const dbBreaker = new CircuitBreaker({
  name: 'outbox-worker',
  failThreshold: 3,
  baseBackoffMs: 15_000,
  maxBackoffMs: 120_000,
});

// ── Service dispatchers ──────────────────────────────────────────────────

async function dispatchXP(matchId, payload) {
  // XP is credited at match completion, not per-event.
  // This hook could handle incremental XP for kill-streaks, combos, etc.
  // XP event logged at debug level only
}

async function dispatchAnalytics(matchId, payload) {
  // Analytics event logged at debug level only
}

async function dispatchAntiCheat(matchId, payload) {
  // Anti-cheat event logged at debug level only
}

async function dispatchNotification(matchId, payload) {
  // Notification event logged at debug level only
}

// ── Event type → service dispatch mapping ─────────────────────────────────

const DISPATCH_MAP = {
  'GAME_START': [dispatchAnalytics],
  'MOVE': [dispatchAnalytics, dispatchAntiCheat],
  'TURN_TIMEOUT': [dispatchAnalytics],
  'GAME_OVER': [dispatchXP, dispatchAnalytics],
  'FORFEIT': [dispatchXP, dispatchAnalytics],
  'DRAW': [dispatchXP, dispatchAnalytics],
  'PLAYER_REMOVED': [dispatchAnalytics],
};

// ── Main worker loop ─────────────────────────────────────────────────────

let running = false;
let timer = null;

async function processBatch() {
  const events = await EventStore.claimOutboxEvents(BATCH_SIZE, LEASE_MS);

  for (const event of events) {
    try {
      const dispatchers = DISPATCH_MAP[event.event_type] || [dispatchAnalytics];
      for (const dispatch of dispatchers) {
        await dispatch(event.match_id, {
          eventType: event.event_type,
          payload: event.payload,
        });
      }
      await EventStore.markOutboxProcessed(event.id);
    } catch (err) {
      logger.error(`[Outbox] Failed to process event ${event.id}:`, { error: err.message });
      await EventStore.markOutboxFailed(event.id, true);
    }
  }
}

async function reclaimStale() {
  const reclaimed = await EventStore.reclaimStaleOutboxEvents(LEASE_MS);
  if (reclaimed > 0) {
    logger.info(`[Outbox] Reclaimed ${reclaimed} stale outbox events`);
  }
}

function start() {
  if (running) return;
  running = true;

  const loop = async () => {
    if (!running) return;
    await dbBreaker.run(async () => {
      try {
        await processBatch();
        await reclaimStale();
      } catch (err) {
        logger.error('[Outbox] Worker error:', { error: err.message });
        // Re-throw so the circuit breaker sees the failure
        throw err;
      }
    });
    if (running) {
      timer = setTimeout(loop, POLL_INTERVAL_MS);
    }
  };

  loop();
}

function stop() {
  if (!running) return;
  running = false;
  if (timer) clearTimeout(timer);
}

module.exports = { start, stop };
