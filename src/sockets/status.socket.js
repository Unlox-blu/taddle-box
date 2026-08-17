'use strict';

const {activeStatusService} = require('../modules/activestatus/activestatus.container')
const redis = require('../config/redis')

let _io = null;

// Per-user socket registry — a user can be connected from several devices at
// once, so a user only goes offline when their LAST socket drops. The same
// registry feeds the server-side staleness sweep: every socket records when
// its app-level heartbeat last refreshed it, and the sweep force-disconnects
// sockets that went quiet, guaranteeing an activeStatus:changed offline event
// instead of a user stuck online (network blackholes, killed app processes
// where the OS never sends FIN, backgrounded clients whose JS timers pause,
// etc).
const socketsByUser = new Map(); // userId -> Set<socket>
// No app-level heartbeat for this long → force-disconnect (then the normal
// disconnect handler marks the user offline and broadcasts it).
const HEARTBEAT_STALE_MS = 45_000;
const SWEEP_INTERVAL_MS = 15_000;
// Redis online-key TTL — refreshed by the client's 20s heartbeat with margin.
const REDIS_ONLINE_TTL_S = 45;

let sweepTimer = null;

// Whether a user's Activity Status is visible to others (settings.activity_status,
// default TRUE when no row exists yet).
const isStatusVisible = async (userId) => {
  try {
    const pool = require('../config/database');
    const { rows } = await pool.query(
      `SELECT activity_status FROM settings WHERE user_id = $1`,
      [userId]
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

// Removes the socket from the registry; returns true when it was the user's
// LAST live socket (i.e. the user should now be marked offline).
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

// Force-disconnect sockets whose heartbeat has gone silent. Socket.IO's own
// ping would eventually fire disconnect anyway (25s interval + 60s timeout ≈
// 85s worst case); this sweep makes detection deterministic and fast (~45s)
// and routes it through the SAME disconnect handler, so followers get the
// offline event + lastSeen immediately rather than waiting out the engine
// timeout.
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

// Tell every ACTIVE follower that this user's active status changed. Only
// emitted when the user has the Activity Status setting enabled.
const broadcastActiveStatus = async (userId, payload) => {
  if (!_io) return;
  if (!(await isStatusVisible(userId))) return;
  try {
    const pool = require('../config/database');
    const { rows } = await pool.query(
      `SELECT follower_id FROM followers WHERE following_id = $1 AND status = 'active'`,
      [userId]
    );
    rows.forEach((r) => {
      _io.to(`user:${r.follower_id}`).emit('activeStatus:changed', payload);
    });
  } catch (error) {
    console.error('Failed to broadcast active status', error);
  }
};

// On connect, push the viewer's OWN follow-list active status over the socket
// so followed users' dots are live immediately with zero REST calls — the same
// push model Insta/FB use. getBatch reuses the REST authz rules (self +
// followed, gated by each target's Activity Status setting).
//
// The snapshot is BOUNDED: for users following 1,000+ people we only push the
// most recently followed SNAPSHOT_LIMIT so the emit + Redis lookups can't
// stall the socket handshake. Everyone beyond the cap still gets their dot via
// the client's on-demand REST backfill (which the freshness window keeps
// cheap), and live activeStatus:changed events keep the recent ones current.
const SNAPSHOT_LIMIT = 200;
const sendActiveStatusSnapshot = async (socket) => {
  try {
    const pool = require('../config/database');
    const { rows } = await pool.query(
      `SELECT following_id FROM followers
       WHERE follower_id = $1 AND status = 'active'
       ORDER BY created_at DESC LIMIT $2`,
      [socket.userId, SNAPSHOT_LIMIT]
    );
    const ids = rows.map((r) => r.following_id);
    if (ids.length === 0) return;
    const snapshot = await activeStatusService.getBatch({ userId: socket.userId, userIds: ids });
    socket.emit('activeStatus:snapshot', snapshot);
  } catch (error) {
    console.error('Failed to send active status snapshot', error);
  }
};

const setupActiveStatus = (io) => {
  _io = io;

  io.on('connection', async (socket) => {
    const statusKey = `user:status:${socket.userId}`

    // Register synchronously (before any await) so the registry is consistent
    // even if the connect work below fails or the socket drops immediately.
    socket.lastHeartbeatAt = Date.now();
    registerSocket(socket);

    try {
        await redis.setex(statusKey, REDIS_ONLINE_TTL_S, 'online');
        await activeStatusService.setOnline({userId: socket.userId});

        console.log(`${socket.userId} is online`)

        // Followers see the user go online in real time.
        await broadcastActiveStatus(socket.userId, { userId: socket.userId, online: true, lastSeen: null });

        // The viewer's own follow-list active status, pushed over the socket.
        await sendActiveStatusSnapshot(socket);
    } catch (error) {
        console.error(error);
    }

    socket.on('heartbeat', async () => {
        try {
            socket.lastHeartbeatAt = Date.now();
            await redis.setex(statusKey, REDIS_ONLINE_TTL_S, 'online');
        } catch (err) {
            console.error(err);
        }
    });

    socket.on('disconnect', async () => {
        // Multi-device safety: only the LAST live socket flips the user to
        // offline. Other open devices keep the user online.
        const wasLastSocket = unregisterSocket(socket);
        if (!wasLastSocket) return;

        try {
            const lastSeenTime = new Date().toISOString();

            console.log(`${socket.userId} disconnected (last socket)`);

            await redis.setex(statusKey, 60, lastSeenTime);
            await activeStatusService.setOffline({userId: socket.userId});

            // Followers see the user go offline (with the timestamp) in real time.
            await broadcastActiveStatus(socket.userId, { userId: socket.userId, online: false, lastSeen: lastSeenTime });
        } catch (err) {
            console.error(err);
        }
    });
  });

  // One sweep timer for the process lifetime.
  if (sweepTimer) clearInterval(sweepTimer);
  sweepTimer = setInterval(sweepStaleSockets, SWEEP_INTERVAL_MS);
  // Don't keep the Node process alive just for the sweep (tests, scripts).
  if (sweepTimer.unref) sweepTimer.unref();
};



module.exports = { setupActiveStatus };
