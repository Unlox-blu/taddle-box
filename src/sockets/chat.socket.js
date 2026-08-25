'use strict';

/**
 * chat.socket.js
 *
 * /chat-socket namespace — chat-level WebSocket.
 *
 * Authenticates by JWT (same as account-socket). Connected only when
 * the chat screen is open, disconnected when the user navigates away.
 *
 * Handles: messages, reactions, typing indicators.
 *
 * Lifecycle: connect on chat open, disconnect on chat close.
 */

let _chatNs = null;

const setupChatSocket = (chatNs) => {
  _chatNs = chatNs;

  chatNs.on('connection', (socket) => {
    if (!socket.userId) return;

    // Join user room for targeted chat events
    socket.join(`user:${socket.userId}`);
    console.info(`[ChatSocket] Connected: user ${socket.userId} on /chat-socket`);

    socket.on('disconnect', (reason) => {
      console.info(`[ChatSocket] Disconnected: user ${socket.userId} — ${reason}`);
    });
  });
};

// ── Emit helpers ────────────────────────────────────────────────────────────

const _getNs = () => {
  if (!_chatNs) {
    const { getNamespace } = require('./index');
    _chatNs = getNamespace('chat');
  }
  return _chatNs;
};

const emitChatMessage = (userId, message) => {
  // Emit to /chat-socket for real-time delivery (chat screen open)
  const chatNs = _getNs();
  if (chatNs) chatNs.to(`user:${userId}`).emit('chat:message', message);

  // Also emit to /account-socket for badge count (always connected)
  try {
    const { getNamespace } = require('./index');
    const accountNs = getNamespace('account');
    if (accountNs) accountNs.to(`user:${userId}`).emit('chat:message', message);
  } catch (e) { /* best-effort */ }

  // Tell devices to re-fetch unread counts for multi-account badges
  try {
    const { emitDeviceUnreadPing } = require('./device.socket');
    emitDeviceUnreadPing(userId).catch(err => console.error('[ChatSocket] emitDeviceUnreadPing failed:', err.message));
  } catch (e) { /* best-effort */ }
};

const emitChatReaction = (userId, payload) => {
  const ns = _getNs();
  if (!ns) return;
  ns.to(`user:${userId}`).emit('chat:reaction', payload);
};

const emitChatTyping = (userId, payload) => {
  const ns = _getNs();
  if (!ns) return;
  ns.to(`user:${userId}`).emit('chat:typing', payload);
};

module.exports = {
  setupChatSocket,
  emitChatMessage,
  emitChatReaction,
  emitChatTyping,
};
