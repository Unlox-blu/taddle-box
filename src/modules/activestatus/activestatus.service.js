'use strict';

const redis = require('../../config/redis');
const { createError } = require('../../utils/error.util');

// DB 'online' rows older than this (and without a live Redis key) are treated
// as leftovers from a dead process. Must be comfortably larger than the
// Redis online-key TTL (45s) so live users who refresh Redis every 20s are
// never misread — the fallback only runs when the Redis key is absent.
const DB_ONLINE_STALE_MS = 90_000;

class ActiveStatusService {
  constructor({ activeStatusRepository }) {
    this.activeStatusRepo = activeStatusRepository;
  }

  // Resolve a user's active status from the hot Redis key first (set on socket
  // connect / heartbeat / disconnect), falling back to the active_status row.
  // Returns { online, lastSeen } or null when unknown — the ONE shape every
  // consumer (REST, socket, profile) uses.
  //
  // The DB row is only written 'online' on connect (Redis is the live source
  // while a socket is up), so a row that still says 'online' but was last
  // updated longer ago than the Redis TTL is a leftover from a dead process /
  // server restart — treat it as offline instead of leaving the user stuck
  // online.
  async resolve(userId) {
    const cacheKey = `user:status:${userId}`;
    const cached = await redis.get(cacheKey).catch(() => null);
    if (cached === 'online') return { online: true, lastSeen: null };
    if (cached) return { online: false, lastSeen: cached };
    const status = await this.activeStatusRepo.findByUserId(userId);
    if (!status) return null;
    if (status.isActive !== 'online') {
      return { online: false, lastSeen: status.lastSeen };
    }
    // Stale 'online' row (no live Redis key for it) → offline.
    const staleMs = Date.now() - new Date(status.updatedAt || 0).getTime();
    if (staleMs > DB_ONLINE_STALE_MS) {
      return { online: false, lastSeen: status.lastSeen || status.updatedAt };
    }
    return { online: true, lastSeen: null };
  }

  async getStatus({ userId }) {
    try {
      const status = await this.resolve(userId);
      if (!status) throw createError('Status not found', 404);
      return status;
    } catch (error) {
      throw error;
    }
  }

  async createStatus({ userId }) {
    try {
      const status = await this.activeStatusRepo.findByUserId(userId);
      if(status)
        throw createError("Status is already exits", 409)
      
      await this.activeStatusRepo.create(userId);
      return { message: 'Status created' };
    } catch (error) {
      throw error;
    }
  }

  // Bulk active status for feed/profile avatars — restricted to self + people
  // the viewer actively follows, and gated by each target's Activity Status
  // setting. Returns a map: { [userId]: { online, lastSeen } | null }.
  async getBatch({ userId: viewerId, userIds }) {
    const ids = [...new Set((userIds || []).filter(Boolean))].slice(0, 50);
    const result = {};
    if (!ids.length) return result;
    const pool = require('../../config/database');

    // The two authz checks below are cached in Redis (60s TTL) so a warm batch
    // costs zero SQL — status polling is chatty by nature, and the client's
    // freshness window means the same viewer repeats the same id set, so the
    // cache absorbs nearly all of it. Only first access (or TTL expiry) hits
    // Postgres.

    // Allow-list: self + users the viewer actively follows.
    const followsKey = `activeStatus:follows:${viewerId}`;
    let allowed = null;
    const cachedFollows = await redis.get(followsKey).catch(() => null);
    if (cachedFollows) {
      try {
        allowed = new Set(JSON.parse(cachedFollows));
      } catch {
        allowed = null; // corrupt value → rebuild from DB
      }
    }
    if (!allowed) {
      const { rows: followRows } = await pool.query(
        `SELECT following_id FROM followers
         WHERE follower_id = $1 AND status = 'active'`,
        [viewerId]
      );
      allowed = new Set(followRows.map((r) => r.following_id));
      allowed.add(viewerId);
      redis.setex(followsKey, 60, JSON.stringify([...allowed])).catch(() => {});
    }

    // Per-user Activity Status visibility (defaults to visible when no row).
    const settings = new Map();
    const cachedVis = await Promise.all(
      ids.map((id) => redis.get(`activeStatus:setting:${id}`).catch(() => null))
    );
    const missIds = [];
    ids.forEach((id, i) => {
      if (cachedVis[i] === null) missIds.push(id);
      else settings.set(id, cachedVis[i] === '1');
    });
    if (missIds.length > 0) {
      const { rows: settingsRows } = await pool.query(
        `SELECT user_id, activity_status FROM settings WHERE user_id = ANY($1::uuid[])`,
        [missIds]
      );
      const byId = new Map(settingsRows.map((r) => [r.user_id, r.activity_status !== false]));
      missIds.forEach((id) => {
        // No settings row → Activity Status is visible (the app's default).
        const visible = byId.has(id) ? byId.get(id) : true;
        settings.set(id, visible);
        redis.setex(`activeStatus:setting:${id}`, 60, visible ? '1' : '0').catch(() => {});
      });
    }

    for (const id of ids) {
      if (!allowed.has(id) || settings.get(id) === false) {
        result[id] = null;
        continue;
      }
      result[id] = await this.resolve(id);
    }
    return result;
  }

  async setOnline({ userId }) {
    try {
      await this.activeStatusRepo.setOnline(userId);
    } catch (error) {
      throw error;
    }
  }

  async setOffline({ userId }) {
    try {
      await this.activeStatusRepo.setOffline(userId);
    } catch (error) {
      throw error;
    }
  }

  async hardDelete({ userId }) {
    try {
      await this.activeStatusRepo.hardDelete(userId);
    } catch (error) {
      throw error;
    }
  }
}

module.exports = ActiveStatusService;
