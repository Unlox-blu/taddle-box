'use strict';

const {activeStatusService} = require('../modules/activestatus/activestatus.container')
const redis = require('../config/redis')

let _io = null;

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

// Tell every ACTIVE follower that this user's presence changed. Only emitted
// when the user has the Activity Status setting enabled.
const broadcastPresence = async (userId, payload) => {
  if (!_io) return;
  if (!(await isStatusVisible(userId))) return;
  try {
    const pool = require('../config/database');
    const { rows } = await pool.query(
      `SELECT follower_id FROM followers WHERE following_id = $1 AND status = 'active'`,
      [userId]
    );
    rows.forEach((r) => {
      _io.to(`user:${r.follower_id}`).emit('presence:changed', payload);
    });
  } catch (error) {
    console.error('Failed to broadcast presence', error);
  }
};

const setupActiveStatus = (io) => {
  _io = io;

  io.on('connection', async (socket) => {
    const statusKey = `user:status:${socket.userId}`

    try {
        await redis.setex(statusKey, 30, 'online');
        await activeStatusService.setOnline({userId: socket.userId});

        console.log(`${socket.userId} is online`)

        // Followers see the user go online in real time.
        await broadcastPresence(socket.userId, { userId: socket.userId, online: true, lastSeen: null });
    } catch (error) {
        console.error(error);
    }

    socket.on('heartbeat', async () => {
        try {
            await redis.setex(statusKey, 30, 'online');
        } catch (err) {
            console.error(err);
        }
    });

    socket.on('disconnect', async () => {
        try {
            const lastSeenTime = new Date().toISOString();

            console.log(`${socket.userId} disconnected`);

            await redis.setex(statusKey, 60, lastSeenTime);
            await activeStatusService.setOffline({userId: socket.userId});

            // Followers see the user go offline (with the timestamp) in real time.
            await broadcastPresence(socket.userId, { userId: socket.userId, online: false, lastSeen: lastSeenTime });
        } catch (err) {
            console.error(err);
        }
    });
  });
};



module.exports = { setupActiveStatus };
