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

module.exports = { setupDeviceSocket, emitSessionRevoked };
