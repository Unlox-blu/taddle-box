'use strict';

const redis = require('../../config/redis');

// Per-user cache of { preferences, settings } used by shouldPush / shouldPushForCategory.
// Short TTL keeps the cache fresh when users toggle notification settings, while
// eliminating the 2-query penalty on every publishNotification call at scale.
const CACHE_TTL_SECONDS = 60;
const PREFIX = 'push:pref:';

/**
 * Returns the cached push preferences for a user, or null on miss.
 */
async function get(userId) {
  try {
    const raw = await redis.get(`${PREFIX}${userId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Stores push preferences for a user with a short TTL.
 */
async function set(userId, data) {
  try {
    await redis.setex(`${PREFIX}${userId}`, CACHE_TTL_SECONDS, JSON.stringify(data));
  } catch {
    // Cache write failure is non-fatal.
  }
}

/**
 * Invalidates the cache for a user (call after preferences are updated).
 */
async function invalidate(userId) {
  try {
    await redis.del(`${PREFIX}${userId}`);
  } catch {
    // Best-effort.
  }
}

module.exports = { get, set, invalidate };
