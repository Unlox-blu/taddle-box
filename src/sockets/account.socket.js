'use strict';

/**
 * account.socket.js
 *
 * /account-socket namespace — account-level WebSocket.
 *
 * Authenticates by JWT. Connected while any user is logged in.
 * Handles: notifications, wallet, XP, leaderboards, follow events,
 *          active status, heartbeat.
 *
 * Lifecycle: connects after login, disconnects on logout.
 */

const { activeStatusService } = require('../modules/activestatus/activestatus.container');
const notificationRepository = require('../modules/notification/notification.repository');
const redis = require('../config/redis');
const pool = require('../config/database');

let _accountNs = null;

// ── Active status infrastructure ────────────────────────────────────────────

const socketsByUser = new Map(); // userId → Set<socket>
const HEARTBEAT_STALE_MS = 45_000;
const SWEEP_INTERVAL_MS = 15_000;
const REDIS_ONLINE_TTL_S = 45;
let sweepTimer = null;

const isStatusVisible = async (userId) => {
  try {
    const { rows } = await pool.query(
      `SELECT activity_status FROM settings WHERE user_id = $1`,
      [userId],
    );
    return rows[0]?.activity_status !== false;
  } catch (e) {
    return true;
  }
};

const registerSocket = (socket) => {
  const set = socketsByUser.get(socket.userId) || new Set();
  set.add(socket);
  socketsByUser.set(socket.userId, set);
};

const unregisterSocket = (socket) => {
  const set = socketsByUser.get(socket.userId);
  if (!set) return false;
  set.delete(socket);
  if (set.size === 0) {
    socketsByUser.delete(socket.userId);
    return true;
  }
  return false;
};

const sweepStaleSockets = () => {
  const now = Date.now();
  const stale = [];
  for (const sockets of socketsByUser.values()) {
    for (const socket of sockets) {
      if (now - (socket.lastHeartbeatAt || 0) > HEARTBEAT_STALE_MS) {
        stale.push(socket);
      }
    }
  }
  stale.forEach((socket) => socket.disconnect(true));
};

const broadcastActiveStatus = async (userId, payload) => {
  if (!_accountNs) return;
  if (!(await isStatusVisible(userId))) return;
  try {
    const { rows } = await pool.query(
      `SELECT follower_id FROM followers WHERE following_id = $1 AND status = 'active'`,
      [userId],
    );
    rows.forEach((r) => {
      _accountNs.to(`user:${r.follower_id}`).emit('activeStatus:changed', payload);
    });
  } catch (error) {
    console.error('Failed to broadcast active status', error);
  }
};

const SNAPSHOT_LIMIT = 200;
const sendActiveStatusSnapshot = async (socket) => {
  try {
    const { rows } = await pool.query(
      `SELECT following_id FROM followers
       WHERE follower_id = $1 AND status = 'active'
       ORDER BY created_at DESC LIMIT $2`,
      [socket.userId, SNAPSHOT_LIMIT],
    );
    const ids = rows.map((r) => r.following_id);
    if (ids.length === 0) return;
    const snapshot = await activeStatusService.getBatch({ userId: socket.userId, userIds: ids });
    socket.emit('activeStatus:snapshot', snapshot);
  } catch (error) {
    console.error('Failed to send active status snapshot', error);
  }
};

// ── Setup ───────────────────────────────────────────────────────────────────

const setupAccountSocket = (accountNs) => {
  _accountNs = accountNs;

  accountNs.on('connection', async (socket) => {
    if (!socket.userId) return;

    const statusKey = `user:status:${socket.userId}`;

    // Register synchronously so the registry is consistent
    socket.lastHeartbeatAt = Date.now();
    registerSocket(socket);

    try {
      await redis.setex(statusKey, REDIS_ONLINE_TTL_S, 'online');
      await activeStatusService.setOnline({ userId: socket.userId });
      console.log(`[AccountSocket] ${socket.userId} is online`);
      await broadcastActiveStatus(socket.userId, { userId: socket.userId, online: true, lastSeen: null });
      await sendActiveStatusSnapshot(socket);
    } catch (error) {
      console.error(error);
    }

    // ── Notification: mark as read ──
    socket.on('notification:mark_read', async ({ notificationId }) => {
      try {
        await notificationRepository.markOneRead(notificationId, socket.userId);
        socket.emit('notification:marked_read', { notificationId });
      } catch (err) {
        socket.emit('notification:error', { message: err.message });
      }
    });

    // ── Heartbeat ──
    socket.on('heartbeat', async () => {
      try {
        socket.lastHeartbeatAt = Date.now();
        await redis.setex(statusKey, REDIS_ONLINE_TTL_S, 'online');
      } catch (err) {
        console.error(err);
      }
    });

    // ── Disconnect ──
    socket.on('disconnect', async (reason) => {
      console.info(`[AccountSocket] ${socket.userId} disconnected: ${reason}`);
      const wasLastSocket = unregisterSocket(socket);
      if (!wasLastSocket) return;

      try {
        const lastSeenTime = new Date().toISOString();
        await redis.setex(statusKey, 60, lastSeenTime);
        await activeStatusService.setOffline({ userId: socket.userId });
        await broadcastActiveStatus(socket.userId, { userId: socket.userId, online: false, lastSeen: lastSeenTime });
      } catch (err) {
        console.error(err);
      }
    });
  });

  // One sweep timer for the process lifetime
  if (sweepTimer) clearInterval(sweepTimer);
  sweepTimer = setInterval(sweepStaleSockets, SWEEP_INTERVAL_MS);
  if (sweepTimer.unref) sweepTimer.unref();
};

// ── Emit helpers (called from services via lazy require) ────────────────────
// All emit through /account-socket namespace, targeting user:${userId} rooms.

const _getNs = () => {
  if (!_accountNs) {
    const { getNamespace } = require('./index');
    _accountNs = getNamespace('account');
  }
  return _accountNs;
};

const emitNotification = (userId, notification) => {
  const ns = _getNs();
  if (!ns) return;
  ns.to(`user:${userId}`).emit('notification:new', notification);
};

const emitWalletUpdate = (userId, newBalanceCents, heldBalanceCents) => {
  const ns = _getNs();
  if (!ns) return;
  ns.to(`user:${userId}`).emit('wallet:updated', { 
    balanceCents: newBalanceCents,
    heldBalanceCents: heldBalanceCents ?? 0,
  });
};

const emitFollowRequestCancelled = (userId, { followerId }) => {
  const ns = _getNs();
  if (!ns) return;
  ns.to(`user:${userId}`).emit('follow:requestCancelled', { followerId });
};

const emitFollowRequestResolved = (userId, { followerId }) => {
  const ns = _getNs();
  if (!ns) return;
  ns.to(`user:${userId}`).emit('follow:requestResolved', { followerId });
};

const emitFollowStateChanged = (userId, { otherUserId, isFollowing }) => {
  const ns = _getNs();
  if (!ns) return;
  ns.to(`user:${userId}`).emit('follow:stateChanged', { otherUserId, isFollowing });
};

const emitXPUpdate = (userId, payload) => {
  const ns = _getNs();
  if (!ns) return;
  ns.to(`user:${userId}`).emit('xp:updated', {
    xp: payload?.xp != null ? payload.xp : null,
    totalXpEarned: payload?.totalXpEarned != null ? payload.totalXpEarned : undefined,
  });
};

// Debounced leaderboards: coalesce bursts into one trailing emit (3s window)
const LEADERBOARDS_CHANGED_DEBOUNCE_MS = 3000;
const leaderboardsChangedDebounceTimers = new Map();

const emitLeaderboardsChanged = (userId, reason = 'game_win') => {
  const ns = _getNs();
  if (!ns) return;
  const prev = leaderboardsChangedDebounceTimers.get(userId);
  if (prev) clearTimeout(prev.timer);
  const timer = setTimeout(() => {
    leaderboardsChangedDebounceTimers.delete(userId);
    ns.to(`user:${userId}`).emit('leaderboards:changed', { reason });
  }, LEADERBOARDS_CHANGED_DEBOUNCE_MS);
  leaderboardsChangedDebounceTimers.set(userId, { timer, reason });
};

module.exports = {
  setupAccountSocket,
  emitNotification,
  emitWalletUpdate,
  emitXPUpdate,
  emitLeaderboardsChanged,
  emitFollowRequestCancelled,
  emitFollowRequestResolved,
  emitFollowStateChanged,
};
