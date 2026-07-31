'use strict';

const redis = require('../../../config/redis');

/**
 * Manages match state persistence and event logging via Redis.
 */
class EventStore {
  /**
   * Save a snapshot of the current match state.
   */
  static async saveMatchSnapshot(matchId, snapshotData, ttlSeconds = 3600 * 24) {
    const key = `match:${matchId}:state`;
    await redis.set(key, JSON.stringify(snapshotData), 'EX', ttlSeconds);
  }

  /**
   * Load the most recent snapshot for a match.
   */
  static async loadMatchSnapshot(matchId) {
    const key = `match:${matchId}:state`;
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  /**
   * Append an event to the match's append-only event log.
   */
  static async appendEvent(matchId, event, ttlSeconds = 3600 * 24) {
    const key = `match:${matchId}:events`;
    const serializedEvent = JSON.stringify({
      timestamp: Date.now(),
      ...event
    });
    
    await redis.rpush(key, serializedEvent);
    await redis.expire(key, ttlSeconds);
  }

  /**
   * Get all events for a match (useful for replay or debugging).
   */
  static async getEvents(matchId) {
    const key = `match:${matchId}:events`;
    const data = await redis.lrange(key, 0, -1);
    return data.map(item => JSON.parse(item));
  }

  /**
   * Clean up all Redis data for a match (typically after archiving to DB).
   */
  static async cleanupMatch(matchId) {
    const stateKey = `match:${matchId}:state`;
    const eventsKey = `match:${matchId}:events`;
    await redis.del(stateKey, eventsKey);
  }
}

module.exports = EventStore;
