'use strict';

<<<<<<< HEAD
const { notificationRepository } = require('../modules/notification/notification.container');
=======
const notificationRepository = require('../modules/notification/notification.repository');
>>>>>>> 5b2004b6cdc754160b22e5fe51fcab9b80dbb0b2

let _io = null;

const setupNotificationSocket = (io) => {
  _io = io;

  io.on('connection', (socket) => {
<<<<<<< HEAD
    
=======
>>>>>>> 5b2004b6cdc754160b22e5fe51fcab9b80dbb0b2

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

// Emits a follow-request lifecycle update so the recipient's notification UI
// can clear a stale Approve/Decline state the moment the requester cancels.
const emitFollowRequestCancelled = (userId, { followerId }) => {
  if (!_io) return;
  _io.to(`user:${userId}`).emit('follow:requestCancelled', { followerId });
};

// Distinct event for when a pending request is RESOLVED by the recipient
// approving it. Using a separate event (instead of requestCancelled) stops the
// UI from flipping the just-approved row to "Request withdrawn".
const emitFollowRequestResolved = (userId, { followerId }) => {
  if (!_io) return;
  _io.to(`user:${userId}`).emit('follow:requestResolved', { followerId });
};

// Emits a follow-state update (mutual follow / unfollow) so the sender's
// notification "Follow Back" button stays in sync in real time.
const emitFollowStateChanged = (userId, { otherUserId, isFollowing }) => {
  if (!_io) return;
  _io.to(`user:${userId}`).emit('follow:stateChanged', { otherUserId, isFollowing });
};

// Emits an XP balance update to a specific user.
const emitXPUpdate = (userId, newXP) => {
  if (!_io) return;
  _io.to(`user:${userId}`).emit('xp:updated', { xp: newXP });
};

module.exports = { setupNotificationSocket, emitNotification, emitWalletUpdate, emitXPUpdate, emitFollowRequestCancelled, emitFollowRequestResolved, emitFollowStateChanged };
