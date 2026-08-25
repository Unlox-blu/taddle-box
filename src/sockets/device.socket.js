'use strict';

/**
 * device.socket.js
 *
 * /device-socket namespace — device-level WebSocket.
 *
 * Authenticates by deviceId (UUID generated at install time, stored in
 * SecureStore). The backend verifies the deviceId exists in client_registry
 * before allowing the connection.
 *
 * Purpose: receives auth:session_revoked events when another device calls
 * "Log out from all devices", so the client can clean up the affected
 * account from the switcher.
 *
 * Lifecycle: connects on app mount (before any user logs in), stays
 * connected for the entire app lifetime.
 */

const pool = require('../config/database');

const setupDeviceSocket = (deviceNs) => {
  deviceNs.on('connection', (socket) => {
    const { deviceId } = socket;

    // Verify deviceId exists in client_registry (any user, any session state)
    pool.query(
      'SELECT DISTINCT device_id FROM client_registry WHERE device_id = $1',
      [deviceId],
    )
      .then(({ rows }) => {
        if (rows.length === 0) {
          console.warn(`[DeviceSocket] Unknown deviceId: ${deviceId}`);
          socket.disconnect();
          return;
        }

        // Join the device room — events like auth:session_revoked are
        // emitted to this room by the backend.
        socket.join(`device:${deviceId}`);
        console.info(`[DeviceSocket] Connected: device ${deviceId} on /device-socket`);

        socket.on('device:get_unread', async () => {
          try {
            const { rows: users } = await pool.query(
              'SELECT DISTINCT user_id FROM client_registry WHERE device_id = $1',
              [deviceId]
            );
            if (users.length === 0) return;
            
            const userIds = users.map(r => r.user_id);
            const statusMap = {};
            
            const { rows: unreadCounts } = await pool.query(`
              SELECT u.id as user_id,
                (SELECT COUNT(*) FROM notifications n WHERE n.recipient_id = u.id AND n.is_read = false) as notif_count,
                (SELECT COUNT(*) FROM conversations c
                 JOIN conversation_participants cp_joined ON cp_joined.conversation_id = c.id AND cp_joined.user_id = u.id
                 JOIN messages m ON m.conversation_id = c.id
                 WHERE m.sender_id != u.id AND m.deleted_at IS NULL
                   AND m.created_at > COALESCE(cp_joined.last_read_at, cp_joined.joined_at)
                ) as chat_count
              FROM users u
              WHERE u.id = ANY($1)
            `, [userIds]);
            
            for (const row of unreadCounts) {
              statusMap[row.user_id] = (parseInt(row.notif_count) > 0) || (parseInt(row.chat_count) > 0);
            }
            socket.emit('device:unread_status', statusMap);
          } catch (err) {
            console.error(`[DeviceSocket] device:get_unread error for ${deviceId}:`, err.message);
          }
        });

        socket.on('disconnect', (reason) => {
          console.info(`[DeviceSocket] Disconnected: device ${deviceId} — ${reason}`);
        });
      })
      .catch((err) => {
        console.error(`[DeviceSocket] Auth failed for deviceId ${deviceId}:`, err.message);
        socket.disconnect();
      });
  });
};

// ── Emit helpers ────────────────────────────────────────────────────────────
// These are called from auth.service.js (lazily required) to notify devices
// when their session is revoked.

let _deviceNs = null;

const _ensureNs = () => {
  if (!_deviceNs) {
    const { getNamespace } = require('./index');
    _deviceNs = getNamespace('device');
  }
  return _deviceNs;
};

// Emits a session-revoked event to a specific device room.
const emitSessionRevoked = (deviceId, { userId }) => {
  const ns = _ensureNs();
  if (!ns) return;
  ns.to(`device:${deviceId}`).emit('auth:session_revoked', { userId });
};

// Emits a ping to all devices of a user to refresh their unread status
const emitDeviceUnreadPing = async (userId) => {
  const ns = _ensureNs();
  if (!ns) return;
  try {
    const { rows } = await pool.query(
      'SELECT DISTINCT device_id FROM client_registry WHERE user_id = $1',
      [userId]
    );
    for (const row of rows) {
      ns.to(`device:${row.device_id}`).emit('device:unread_ping', { userId });
    }
  } catch (err) {
    console.error(`[DeviceSocket] Failed to emit unread ping for user ${userId}:`, err.message);
  }
};

module.exports = { setupDeviceSocket, emitSessionRevoked, emitDeviceUnreadPing };
