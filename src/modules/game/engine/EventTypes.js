'use strict';

/**
 * Event Types — canonical constants for all game engine events.
 * Used by EventStore, outbox, analytics, and anti-cheat consumers.
 */

const EVENT_TYPES = {
  // ── Lifecycle ──────────────────────────────────────────────────────────
  MATCH_CREATED: 'MATCH_CREATED',
  PLAYER_JOINED: 'PLAYER_JOINED',
  MATCH_STARTED: 'MATCH_STARTED',
  MATCH_PAUSED: 'MATCH_PAUSED',
  MATCH_RESUMED: 'MATCH_RESUMED',
  MATCH_FINISHED: 'MATCH_FINISHED',
  MATCH_ARCHIVED: 'MATCH_ARCHIVED',

  // ── Gameplay ───────────────────────────────────────────────────────────
  MOVE: 'MOVE',
  COMMAND_EXECUTED: 'COMMAND_EXECUTED',
  STATE_CHANGED: 'STATE_CHANGED',
  TIMER_EXPIRED: 'TIMER_EXPIRED',
  TURN_TIMEOUT: 'TURN_TIMEOUT',

  // ── Round Lifecycle ───────────────────────────────────────────────────
  ROUND_CREATED: 'ROUND_CREATED',     // server created next round definition
  ROUND_STARTED: 'ROUND_STARTED',     // server started the round (all ready)
  ROUND_READY: 'ROUND_READY',         // client confirmed assets loaded
  ROUND_FINISHED: 'ROUND_ENDED',      // round completed (plugin says finished)

  // ── Player Events ──────────────────────────────────────────────────────
  PLAYER_DISCONNECTED: 'PLAYER_DISCONNECTED',
  PLAYER_RECONNECTED: 'PLAYER_RECONNECTED',
  PLAYER_FORFEITED: 'PLAYER_FORFEITED',
  PLAYER_TIMED_OUT: 'PLAYER_TIMED_OUT',
  PLAYER_REMOVED: 'PLAYER_REMOVED',

  // ── Match Results ──────────────────────────────────────────────────────
  GAME_START: 'GAME_START',
  GAME_OVER: 'GAME_OVER',
  FORFEIT: 'FORFEIT',
  DRAW: 'DRAW',

  // ── Anti-Cheat ─────────────────────────────────────────────────────────
  SUSPICIOUS_MOVE: 'SUSPICIOUS_MOVE',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',

  // ── Rewards ────────────────────────────────────────────────────────────
  XP_AWARDED: 'XP_AWARDED',
  XP_DEDUCTED: 'XP_DEDUCTED',
  LEVEL_UP: 'LEVEL_UP',

  // ── Chat ───────────────────────────────────────────────────────────────
  CHAT_MESSAGE: 'CHAT_MESSAGE',
};

module.exports = EVENT_TYPES;
