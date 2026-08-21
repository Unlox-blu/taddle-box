'use strict';

const notificationRepository = require('../modules/notification/notification.repository');

let _io = null;

const setupNotificationSocket = (io) => {
  _io = io;

  io.on('connection', (socket) => {
    if (!socket.userId) return; // Device sockets don't process notifications

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

// Emits an XP update to a specific user. Carries BOTH the spendable balance
// (xp) and the cumulative total earned (totalXpEarned) so the profile's level/
// rank/progress UI can update live from the same event that refreshes the
// wallet balance — spending XP moves only `xp`, never totalXpEarned.
const emitXPUpdate = (userId, payload) => {
  if (!_io) return;
  _io.to(`user:${userId}`).emit('xp:updated', {
    xp: payload?.xp != null ? payload.xp : null,
    totalXpEarned: payload?.totalXpEarned != null ? payload.totalXpEarned : undefined,
  });
};

// Tells a user their weekly leaderboard rankings changed (e.g. a fresh game
// win). The rankings are server-computed, so this is just a trigger for the
// app to silently refetch /leaderboards/weekly.
//
// Debounced PER USER: a burst of engagement (a post racking up likes/views
// from many viewers, multiple community joins) fires this once per action, but
// each emit makes the client refetch the leaderboard endpoint. Coalescing into
// a single trailing emit (3s window, latest reason wins) keeps the socket and
// the follow-up fetch to one per burst without losing the update.
const LEADERBOARDS_CHANGED_DEBOUNCE_MS = 3000;
const leaderboardsChangedDebounceTimers = new Map();

const emitLeaderboardsChanged = (userId, reason = 'game_win') => {
  if (!_io) return;
  const prev = leaderboardsChangedDebounceTimers.get(userId);
  if (prev) clearTimeout(prev.timer);
  const timer = setTimeout(() => {
    leaderboardsChangedDebounceTimers.delete(userId);
    _io.to(`user:${userId}`).emit('leaderboards:changed', { reason });
  }, LEADERBOARDS_CHANGED_DEBOUNCE_MS);
  leaderboardsChangedDebounceTimers.set(userId, { timer, reason });
};

// Emits a session-revoked event to a specific device room.
// Used when "Log out from all devices" is called — the backend looks up
// all device_ids for the user and emits to each device room so the client
// can clean up the affected account.
const emitSessionRevoked = (deviceId, { userId }) => {
  if (!_io) return;
  _io.to(`device:${deviceId}`).emit('auth:session_revoked', { userId });
};

module.exports = { setupNotificationSocket, emitNotification, emitWalletUpdate, emitXPUpdate, emitLeaderboardsChanged, emitFollowRequestCancelled, emitFollowRequestResolved, emitFollowStateChanged, emitSessionRevoked };
