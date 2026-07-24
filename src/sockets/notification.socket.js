'use strict';

const { notificationRepository } = require('../modules/notification/notification.container');
const NotificationRedisService = require('../modules/notification/notification.redis');

let _io = null;
const redisService = new NotificationRedisService();

const setupNotificationSocket = (io) => {
  _io = io;

  io.on('connection', (socket) => {
    if (socket.userId) {
      redisService.setUserOnline(socket.userId).catch(() => null);
    }

    socket.on('disconnect', () => {
      if (socket.userId) {
        redisService.setUserOffline(socket.userId).catch(() => null);
      }
    });

    // Client explicitly marks a notification as read via socket
    socket.on('notification:mark_read', async ({ notificationId }) => {
      try {
        await notificationRepository.markOneRead(notificationId, socket.userId);
        socket.emit('notification:marked_read', { notificationId });
      } catch (err) {
        socket.emit('notification:error', { message: err.message });
      }
    });
  });
};

// Emits a real-time notification to a specific user.
const emitNotification = (userId, notification) => {
  if (!_io) return;
  _io.to(`user:${userId}`).emit('notification:new', notification);
};

// Emits a wallet balance update to a specific user.
const emitWalletUpdate = (userId, newBalanceCents) => {
  if (!_io) return;
  _io.to(`user:${userId}`).emit('wallet:updated', { balanceCents: newBalanceCents });
};

// Emits an XP balance update to a specific user.
const emitXPUpdate = (userId, newXP) => {
  if (!_io) return;
  _io.to(`user:${userId}`).emit('xp:updated', { xp: newXP });
};

module.exports = { setupNotificationSocket, emitNotification, emitWalletUpdate, emitXPUpdate };
