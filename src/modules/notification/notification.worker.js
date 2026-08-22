'use strict';

const redis = require('../../config/redis');
const pool = require('../../config/database');
const { emitNotification } = require('../../sockets/account.socket');
const notificationRepository = require('./notification.repository');
const { addJob } = require('../../jobs/queues/job.queue');
const pushNotificationPrefCache = require('./pushNotification.prefcache');

// Instagram-style stacked copy. The FIRST actor's name renders in the app's
// actor line (senderName), so the message is just the tail:
//   1 actor  → "liked your post"                     → "A liked your post"
//   2 actors → "and B liked your post"               → "A and B liked your post"
//   3+       → "and 2 others liked your post"        → "A and 2 others liked your post"
const BATCH_VERBS = {
  POST_LIKE: 'liked your post',
  COMMENT: 'commented on your post',
  REPLY: 'replied to your comment',
  REQUEST_TO_JOIN_COMMUNITY: 'requested to join your community',
};

const BATCH_TITLES = {
  POST_LIKE: 'Post liked',
  COMMENT: 'New comments',
  REPLY: 'New replies',
  REQUEST_TO_JOIN_COMMUNITY: 'Join requests',
};

const buildBatchMessage = (type, count, secondName) => {
  const n = count || 1;
  const verb = BATCH_VERBS[String(type || '').toUpperCase()] || 'interacted with your post';
  if (n === 1) return verb;
  if (n === 2 && secondName) return `and ${secondName} ${verb}`;
  return `and ${n - 1} others ${verb}`;
};

// Emits an aggregated (batched) notification. This runs on a BullMQ worker for
// events configured with `batch: true` (POST_LIKE, COMMENT, REPLY, community
// join requests). It:
//   1. Reads the batch metadata + ordered actor ids from Redis.
//   2. Resolves actor names (one batched query) so the stacked copy can name
//      the second actor ("A and B liked your post").
//   3. Creates a REAL row in the `notifications` table carrying the aggregated
//      message + a meta JSONB (actorCount / actorIds / actorNames) so the app
//      can render the +N stacking badge.
//   4. Delivers in real-time over the socket.
//   5. Queues a push when the recipient is not currently online.
//   6. Cleans up the Redis batch keys so the batch isn't re-emitted.
async function emitNotificationBatch(data) {
  const { batchKey } = data || {};
  if (!batchKey) return;

  const batch = await redis.hgetall(batchKey);
  if (!batch || !batch.recipientId) return;

  // Ordered actor list (arrival order — Redis SETs don't preserve it, so the
  // batch keeps a JSON array too). Falls back to the legacy `:actors` set for
  // batches created before the ordered field existed.
  let actorIds = [];
  try {
    actorIds = JSON.parse(batch.actorOrder || '[]');
  } catch (e) {
    actorIds = [];
  }
  if (actorIds.length === 0) {
    const actorsKey = `${batchKey}:actors`;
    actorIds = await redis.smembers(actorsKey);
  }
  actorIds = [...new Set(actorIds.filter(Boolean))];

  const recipientId = batch.recipientId;
  const type = batch.type || 'POST_LIKE';
  const count = actorIds.length || 1;

  // Resolve actor display names in ONE batched query (never N+1).
  let nameById = {};
  if (actorIds.length > 0) {
    try {
      const { rows } = await pool.query(
        'SELECT id, name, username FROM users WHERE id = ANY($1::uuid[])',
        [actorIds]
      );
      rows.forEach((r) => {
        nameById[r.id] = r.name || r.username || null;
      });
    } catch (e) {
      // Name resolution failure just degrades to "+N others" copy.
    }
  }

  const secondName = actorIds[1] ? nameById[actorIds[1]] : null;
  const message = buildBatchMessage(type, count, secondName);
  const title = BATCH_TITLES[String(type).toUpperCase()] || 'Notification';

  const meta = {
    actorCount: count,
    actorIds,
    actorNames: actorIds.map((id) => nameById[id]).filter(Boolean),
  };

  // Persist a real notification row so it shows up in GET /notifications.
  const notif = await notificationRepository.createNotification({
    recipientId,
    senderId: actorIds[0] || null,
    type,
    title,
    message,
    resourceType: batch.resourceType || null,
    resourceId: batch.resourceId || null,
    meta,
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
      meta,
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
      senderId: actorIds[0] || null,
      type,
      title,
      message,
      resourceType: batch.resourceType || null,
      resourceId: batch.resourceId || null,
      meta,
    });
  }

  // Clean up the batch so a future event starts a fresh batch.
  await redis.del(batchKey);
  await redis.del(`${batchKey}:actors`);
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
  REQUEST_TO_JOIN_COMMUNITY: 'community',
  COMMUNITY: 'community',
  EVENT: 'event',
  PROMOTION: 'promotion',
};

async function shouldPushForCategory(userId, type) {
  try {
    // Try cache first.
    let cached = await pushNotificationPrefCache.get(userId);
    if (!cached) {
      const [prefs, settings] = await Promise.all([
        notificationRepository.findPreferenceByUserId(userId),
        pool.query(
          `SELECT system_notification, notif_xp, notif_promos
           FROM settings WHERE user_id = $1`,
          [userId]
        ).then(({ rows }) => rows[0] || null),
      ]);
      cached = { prefs, settings };
      await pushNotificationPrefCache.set(userId, cached);
    }

    const { prefs, settings } = cached;

    // 1. Check notification_preferences (granular per-category toggles).
    if (prefs) {
      const column = CATEGORY_COLUMN[String(type || '').toUpperCase()];
      if (column && prefs[column] === false) return false;
    }

    // 2. Check settings table (system_notification master toggle +
    //    per-type toggles that the Settings screen exposes).
    if (settings) {
      if (settings.system_notification === false) return false;
      const t = String(type || '').toUpperCase();
      if (t === 'PROMOTION' && settings.notif_promos === false) return false;
    }

    return true;
  } catch (e) {
    return true;
  }
}

module.exports = emitNotificationBatch;
