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

const pool = require('../config/database');
const EventStore = require('../modules/game/engine/EventStore');

const BATCH_SIZE = 10;
const LEASE_MS = 30000;
const POLL_INTERVAL_MS = 2000;

// ── Service dispatchers ──────────────────────────────────────────────────

async function dispatchXP(matchId, payload) {
  // XP is credited at match completion, not per-event.
  // This hook could handle incremental XP for kill-streaks, combos, etc.
  console.info(`[Outbox] XP event for match ${matchId}:`, payload.eventType);
}

async function dispatchAnalytics(matchId, payload) {
  console.info(`[Outbox] Analytics event for match ${matchId}:`, payload.eventType);
}

async function dispatchAntiCheat(matchId, payload) {
  console.info(`[Outbox] Anti-cheat event for match ${matchId}:`, payload.eventType);
}

async function dispatchNotification(matchId, payload) {
  console.info(`[Outbox] Notification event for match ${matchId}:`, payload.eventType);
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
      console.error(`[Outbox] Failed to process event ${event.id}:`, err.message);
      await EventStore.markOutboxFailed(event.id, true);
    }
  }
}

async function reclaimStale() {
  const reclaimed = await EventStore.reclaimStaleOutboxEvents(LEASE_MS);
  if (reclaimed > 0) {
    console.info(`[Outbox] Reclaimed ${reclaimed} stale outbox events`);
  }
}

function start() {
  if (running) return;
  running = true;

  console.info('[Outbox] Worker started');

  const loop = async () => {
    if (!running) return;
    try {
      await processBatch();
      await reclaimStale();
    } catch (err) {
      console.error('[Outbox] Worker error:', err.message);
    }
    if (running) {
      setTimeout(loop, POLL_INTERVAL_MS);
    }
  };

  loop();
}

function stop() {
  running = false;
  console.info('[Outbox] Worker stopped');
}

module.exports = { start, stop };
