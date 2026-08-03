'use strict';

const redis = require('../../config/redis');
const { emitNotification } = require('../../sockets/notification.socket');
const notificationRepository = require('./notification.repository');
const { addJob } = require('../../jobs/queues/job.queue');

// Builds a human-readable aggregated message from a batch's actor count.
const buildBatchMessage = (type, count) => {
  const normalized = String(type || '').toUpperCase();
  const n = count || 1;
  switch (normalized) {
    case 'POST_LIKE':
      return `${n} ${n === 1 ? 'person liked' : 'people liked'} your post`;
    case 'COMMENT':
      return `${n} ${n === 1 ? 'comment was' : 'comments were'} left on your post`;
    case 'REPLY':
      return `${n} ${n === 1 ? 'reply' : 'replies'} on your comment`;
    default:
      return `${n} new ${n === 1 ? 'update' : 'updates'} on your post`;
  }
};

// Emits an aggregated (batched) notification. This runs on a BullMQ worker for
// events configured with `batch: true` (e.g. POST_LIKE, COMMENT). It:
//   1. Reads the batch metadata + actor ids from Redis.
//   2. Creates a REAL row in the `notifications` table (batched rows used to be
//      written to `batch_notifications` which the app's list endpoint never reads).
//   3. Delivers in real-time over the socket.
//   4. Queues a push when the recipient is not currently online.
//   5. Cleans up the Redis batch keys so the batch isn't re-emitted.
async function emitNotificationBatch(data) {
  const { batchKey } = data || {};
  if (!batchKey) return;

  const batch = await redis.hgetall(batchKey);
  if (!batch || !batch.recipientId) return;

  const actorsKey = `${batchKey}:actors`;
  const senderIds = await redis.smembers(actorsKey);
  const senderCount = senderIds.length;

  const recipientId = batch.recipientId;
  const type = batch.type || 'POST_LIKE';
  const message = buildBatchMessage(type, senderCount);
  const title = String(type).toUpperCase() === 'POST_LIKE' ? 'Post liked' : 'New comments';

  // Persist a real notification row so it shows up in GET /notifications.
  const notif = await notificationRepository.createNotification({
    recipientId,
    senderId: senderIds[0] || null,
    type,
    title,
    message,
    resourceType: batch.resourceType || null,
    resourceId: batch.resourceId || null,
  });

  if (notif) {
    emitNotification(recipientId, notif);
  } else {
    emitNotification(recipientId, {
      id: Date.now().toString(),
      type,
      title,
      message,
      resourceType: batch.resourceType,
      resourceId: batch.resourceId,
      isRead: false,
      createdAt: new Date().toISOString(),
    });
  }

  // Push when the recipient isn't currently connected to the socket, unless
  // their preferences disable this category (mirrors publishNotification).
  const status = await redis.get(`user:status:${recipientId}`).catch(() => null);
  if (status !== 'online' && (await shouldPushForCategory(recipientId, type))) {
    await addJob('notification:push', {
      recipientId,
      senderId: senderIds[0] || null,
      type,
      title,
      message,
      resourceType: batch.resourceType || null,
      resourceId: batch.resourceId || null,
    });
  }

  // Clean up the batch so a future event starts a fresh batch.
  await redis.del(batchKey);
  await redis.del(actorsKey);
}

// Maps a notification type to its notification_preferences column and returns
// whether the recipient wants it. Missing preferences/columns default to true
// so delivery is never silently blocked.
const CATEGORY_COLUMN = {
  POST_LIKE: 'post_like',
  COMMENT: 'comment',
  REPLY: 'reply',
  MENTION: 'mention',
  FOLLOW: 'follow',
  REQUEST_TO_FOLLOW: 'follow',
  APPROVED_TO_FOLLOW: 'follow',
  COMMUNITY: 'community',
  EVENT: 'event',
  PROMOTION: 'promotion',
};

async function shouldPushForCategory(userId, type) {
  try {
    const prefs = await notificationRepository.findPreferenceByUserId(userId);
    if (!prefs) return true;
    const column = CATEGORY_COLUMN[String(type || '').toUpperCase()];
    if (!column) return true;
    return prefs[column] === undefined ? true : Boolean(prefs[column]);
  } catch (e) {
    return true;
  }
}

module.exports = emitNotificationBatch;
