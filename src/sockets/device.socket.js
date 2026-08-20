'use strict';

/**
 * device.socket.js
 *
 * Device-level WebSocket namespace (/device).
 *
 * Authenticates by deviceId (UUID generated at install time, stored in
 * SecureStore). The backend verifies the deviceId exists in client_registry
 * before allowing the connection.
 *
 * Purpose: receives auth:session_revoked events when another device calls
 * "Log out from all devices", so the client can clean up the affected
 * account from the switcher.
 */

const { getIO } = require('./index');

let _io = null;

const setupDeviceSocket = (io) => {
  _io = io;

  // We use the main namespace but with a separate auth path.
  // Device sockets connect with { deviceId } in handshake auth.
  // The main socket middleware expects a JWT — device sockets skip that
  // by connecting before the user-level middleware runs, or we handle
  // them in the connection handler.
  //
  // Approach: listen on the main namespace, check if the handshake has
  // a deviceId instead of a token. If so, authenticate as a device socket.

  io.on('connection', (socket) => {
    const deviceId = socket.handshake.auth?.deviceId;

    if (!deviceId) {
      // Not a device socket — let the normal user-level flow handle it
      return;
    }

    // Verify deviceId exists in client_registry (any user, any session state)
    const pool = require('../config/database');

    pool.query(
      'SELECT DISTINCT device_id FROM client_registry WHERE device_id = $1',
      [deviceId]
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
        console.info(`[DeviceSocket] Connected: device ${deviceId}`);

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

module.exports = { setupDeviceSocket };
