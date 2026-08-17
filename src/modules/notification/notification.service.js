'use strict';

const redis = require('../../config/redis')
const { createError } = require('../../utils/error.util');
const NotificationModel = require('./notification.model');
const NotificationBatchService = require('./notification.batch');
const NotificationSchedulerService = require('./notification.scheduler');
const notificationRepository = require('./notification.repository');
const followersRepository = require('../user/followers.repository');
const {
  DEFAULT_NOTIFICATION_DEFINITIONS,
  PRIORITY,
  normalizeType,
  resolveNotificationPolicy,
} = require('./notification.constants');
const { emitNotification, emitWalletUpdate } = require('../../sockets/notification.socket');
const { addJob } = require('../../jobs/queues/job.queue');

class NotificationService {
  constructor({
    notificationRepository,
    pushService,
    batchService = new NotificationBatchService(),
    schedulerService = new NotificationSchedulerService(),
  } = {}) {
    this.notifRepo = notificationRepository;
    this.pushSvc = pushService;
    this.batchService = batchService;
    this.schedulerService = schedulerService;
  }

  async create({
    recipientId,
    senderId,
    type,
    title,
    message,
    resourceType = null,
    resourceId = null,
  }) {
    return this.publishNotification({
      type,
      recipientId,
      senderId,
      resourceId,
      resourceType,
      title,
      message,
    });
  }

  // Bulk fan-out (e.g. "X posted a new post" → the author's followers).
  // Inserts every row in ONE multi-row INSERT per chunk instead of N
  // publishNotification calls (which would be N inserts + N redis status
  // checks + N push-job checks). Push/socket delivery is intentionally skipped
  // for fan-outs — the row lands in the in-app notifications list only, which
  // is the point of a low-priority "new post" ping. Callers are expected to
  // have already capped + filtered the recipient list (see
  // followersRepository.getActiveFollowerIds prefColumn/limit opts).
  async createMany(items) {
    if (!Array.isArray(items) || items.length === 0) return 0;
    const CHUNK = 500; // stays well under Postgres' parameter limit
    let total = 0;
    for (let i = 0; i < items.length; i += CHUNK) {
      total += await this.notifRepo.createNotificationsBatch(
        items.slice(i, i + CHUNK)
      );
    }
    return total;
  }

  async getAll({ userId, limit, offset, unreadOnly, types, q, timeCutoff, sort }) {
    const { notifications, total } = await this.notifRepo.findByUser(
      userId,
      limit,
      offset,
      unreadOnly,
      types || null,
      q || '',
      timeCutoff || null,
      sort || 'latest'
    );
    const unreadCount = await this.notifRepo.getUnreadCount(userId);
    // Per-bucket counts for the type pills — same q/time filters as the list.
    const counts = await this.notifRepo.countByTypes(
      userId,
      q || '',
      timeCutoff || null
    );

    // Enrich follow notifications with the *live* follow state so the app never
    // shows a stale Approve/Follow-Back button:
    //  - FOLLOW            → isMutual:      does the recipient already follow the sender?
    //  - FOLLOW            → senderPrivacy: sender's account privacy (private
    //                         accounts make follow-back a REQUEST, not a follow)
    //  - REQUEST_TO_FOLLOW → requestActive: is the pending request still in the DB?
    const senderIds = notifications
      .filter((n) => (n.type === 'FOLLOW' || n.type === 'APPROVED_TO_FOLLOW') && n.senderId)
      .map((n) => n.senderId);
    const senderPrivacyMap = {};
    if (senderIds.length > 0) {
      try {
        const pool = require('../../config/database');
        const { rows } = await pool.query(
          'SELECT id, privacy FROM users WHERE id = ANY($1::uuid[])',
          [senderIds]
        );
        rows.forEach((r) => { senderPrivacyMap[r.id] = r.privacy; });
      } catch (e) {
        // Enrichment failure must not break the notifications list.
      }
    }
    for (const n of notifications) {
      if (!n.senderId) continue;
      if (n.type === 'FOLLOW' || n.type === 'APPROVED_TO_FOLLOW') {
        const rel = await followersRepository.findByFollowerIdAndFollowingId(userId, n.senderId);
        n.isMutual = !!(rel && rel.status === 'active');
        n.senderPrivacy = senderPrivacyMap[n.senderId] || 'public';
      } else if (n.type === 'REQUEST_TO_FOLLOW') {
        const rel = await followersRepository.findByFollowerIdAndFollowingId(n.senderId, userId);
        n.requestActive = !!(rel && rel.status === 'pending');
      }
    }

    // Thumbnail enrichment: give the app a small preview image for rows that
    // reference content (post media, community avatar, game cover) so the list
    // renders a proper thumbnail instead of an empty gap. One batched query per
    // resource kind — never N+1 — and any failure just skips the thumbnail.
    try {
      const pool = require('../../config/database');
      const postRows = notifications.filter(
        (n) => n.resourceType === 'post' && n.resourceId
      );
      if (postRows.length > 0) {
        const ids = [...new Set(postRows.map((n) => n.resourceId))];
        const { rows } = await pool.query(
          `SELECT DISTINCT ON (m.post_id) m.post_id, m.cloudfront_url
           FROM media m
           WHERE m.post_id = ANY($1::uuid[]) AND (m.media_type IS NULL OR m.media_type <> 'audio')
           ORDER BY m.post_id, m.created_at ASC`,
          [ids]
        );
        const thumbByPost = Object.fromEntries(
          rows.map((r) => [r.post_id, r.cloudfront_url])
        );
        postRows.forEach((n) => { n.thumbnailUrl = thumbByPost[n.resourceId] || null; });
      }

      const communityRows = notifications.filter(
        (n) => n.resourceType === 'community' && n.resourceId
      );
      if (communityRows.length > 0) {
        const ids = [...new Set(communityRows.map((n) => n.resourceId))];
        const { rows } = await pool.query(
          `SELECT c.id, c.name,
                  av.cloudfront_url AS avatar_url,
                  bm.cloudfront_url AS banner_url
           FROM communities c
           LEFT JOIN media av ON av.id = c.avatar_url
           LEFT JOIN media bm ON bm.id = c.banner_url
           WHERE c.id = ANY($1::uuid[]) AND c.deleted_at IS NULL`,
          [ids]
        );
        const communityById = Object.fromEntries(
          rows.map((r) => [r.id, r])
        );
        communityRows.forEach((n) => {
          const c = communityById[n.resourceId];
          n.thumbnailUrl = c?.avatar_url || null;
          // Full community identity for the app: name renders in the row,
          // banner/avatar as the visual.
          n.communityName = c?.name || null;
          n.communityAvatarUrl = c?.avatar_url || null;
          n.communityBannerUrl = c?.banner_url || null;
        });
      }

      const gameRows = notifications.filter(
        (n) => n.resourceType === 'game_lobby' && n.resourceId
      );
      if (gameRows.length > 0) {
        const ids = [...new Set(gameRows.map((n) => n.resourceId))];
        const { rows } = await pool.query(
          `SELECT id, thumbnail FROM game WHERE id = ANY($1::uuid[])`,
          [ids]
        );
        const thumbByGame = Object.fromEntries(
          rows.map((r) => [r.id, r.thumbnail])
        );
        gameRows.forEach((n) => { n.thumbnailUrl = thumbByGame[n.resourceId] || null; });
      }
    } catch (e) {
      // Enrichment failure must never break the notifications list.
    }

    return { notifications, total, unreadCount, counts };
  }

  async getUnreadCount({ userId }) {
    return this.notifRepo.getUnreadCount(userId);
  }

  async markAllRead({ userId }) {
    await this.notifRepo.markAllRead(userId);
  }

  async markOneRead({ notificationId, userId }) {
    await this.notifRepo.markOneRead(notificationId, userId);
  }

  async ensurePreferences(userId) {
    const existing = await this.notifRepo.findPreferenceByUserId(userId);
    if (existing) return existing;
    return this.notifRepo.createDefaultPreferences(userId);
  }

  async getPreferences(userId) {
    const preferences = await this.ensurePreferences(userId);
    if (!preferences) throw createError('Notification preferences not found', 404);
    return preferences;
  }

  async updatePreferences(userId, updates) {
    const allowedFields = [
      'likes',
      'comments',
      'replies',
      'mentions',
      'follows',
      'communities',
      'events',
      'marketing',
      'quiet_hours_start',
      'quiet_hours_end',
    ];

    const sanitized = Object.fromEntries(
      Object.entries(updates || {}).filter(([key]) => allowedFields.includes(key))
    );

    if (!Object.keys(sanitized).length) {
      return this.getPreferences(userId);
    }

    await this.ensurePreferences(userId);
    return this.notifRepo.upsertPreferences(userId, sanitized);
  }

  async emitWalletUpdate(userId, newBalanceCents) {
    emitWalletUpdate(userId, newBalanceCents);
  }

  getQuietHoursDelay(priority) {
    if (priority !== PRIORITY.LOW) return 0;
    const now = new Date();
    const hour = now.getHours();
    if (hour >= 22 || hour < 7) {
      const nextMorning = new Date(now);
      nextMorning.setHours(7, 0, 0, 0);
      if (nextMorning <= now) nextMorning.setDate(nextMorning.getDate() + 1);
      return Math.max(0, nextMorning.getTime() - now.getTime());
    }
    return 0;
  }

  async publishNotification(event) {
  
    const policy = resolveNotificationPolicy(event);
    const payload = { ...event, policy, createdAt: new Date().toISOString() };
    
    const {recipientId, senderId, type, title, resourceType, resourceId} = payload

    if (policy.batch) {
      // Aggregation lives in Redis (batch hash + ordered actor list); the emit
      // worker turns it into ONE real notification row with stacked copy and
      // actor meta. The batch_notifications TABLE is vestigial (the worker and
      // the list endpoint never read it), so it is intentionally not written.
      const { key, isNew } = await this.batchService.addToBatch({
        recipientId: event.recipientId,
        senderId: event.senderId,
        resourceType: event.resourceType,
        resourceId: event.resourceId,
        type: policy.type,
        payload,
      });

      if (isNew) {
        await addJob(
          'notification:emit',
        {
            batchKey: key
        },
        {
            jobId: key,
            delay: policy.delay
        }
        );
      }
    } else {
      let notif;
      if (policy.save) {
        notif = await this.notifRepo.createNotification({
          recipientId,
          senderId,
          type,
          title,
          message: event.message,
          resourceType,
          resourceId,
        });
      }
      if (policy.socket) {
        const formatted = notif ? notif : {
          id: Date.now().toString(),
          type,
          title,
          message: event.message,
          resourceType,
          resourceId,
          isRead: false,
        };
        emitNotification(recipientId, formatted);
      }
    }

    const activeCacheKey = `user:status:${recipientId}`;

    // Push whenever the recipient is NOT actively connected to the socket. This
    // includes users who never connected (status key missing) — previously a
    // missing key meant NO push was ever queued, which is why users with the
    // app killed or on a fresh device never received anything.
    //
    // Batched events (POST_LIKE, COMMENT) skip the immediate push — their emit
    // worker queues the push AFTER aggregation with the final message, so
    // pushing here would send a duplicate.
    const isOnline = (await redis.get(activeCacheKey)) === 'online';

    if (!isOnline && !policy.batch && (await this.shouldPush(recipientId, policy.category))) {
      const pushNotification = { recipientId, senderId, type, title, message: event.message, resourceType, resourceId };
      await addJob('notification:push', pushNotification);
    }
  }

  // Respects the recipient's notification preferences before queueing a push.
  // Any preference we can't map or can't load defaults to enabled so delivery
  // is never silently blocked by a schema mismatch.
  async shouldPush(userId, category) {
    try {
      const prefs = await this.notifRepo.findPreferenceByUserId(userId);
      if (!prefs) return true;
      const columnMap = {
        likes: 'post_like',
        comments: 'comment',
        replies: 'reply',
        mentions: 'mention',
        follows: 'follow',
        communities: 'community',
        events: 'event',
        marketing: 'promotion',
      };
      const column = columnMap[category];
      if (!column) return true;
      const value = prefs[column];
      return value === undefined ? true : Boolean(value);
    } catch (error) {
      return true;
    }
  }
}

module.exports = NotificationService;
