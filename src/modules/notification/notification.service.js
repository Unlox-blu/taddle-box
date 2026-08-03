'use strict';

const redis = require('../../config/redis')
const NotificationModel = require('./notification.model');
const NotificationBatchService = require('./notification.batch');
const NotificationSchedulerService = require('./notification.scheduler');
const notificationRepository = require('./notification.repository');
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

  async getAll({ userId, limit, offset, unreadOnly }) {
    const { notifications, total } = await this.notifRepo.findByUser(
      userId,
      limit,
      offset,
      unreadOnly
    );
    const unreadCount = await this.notifRepo.getUnreadCount(userId);
    return { notifications, total, unreadCount };
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
      const { key, isNew } = await this.batchService.addToBatch({
        recipientId: event.recipientId,
        senderId: event.senderId,
        resourceType: event.resourceType,
        resourceId: event.resourceId,
        type: policy.type,
        payload,
      });

      if (isNew) {
        await this.notifRepo.createBatchNotification({recipientId, senderId:[senderId], type, title, resourceType, resourceId})

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
      else {
        await this.notifRepo.addToBatchNotification({recipientId, senderId, resourceId})
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
