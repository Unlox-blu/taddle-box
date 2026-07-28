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
    }

    const activeCacheKey = `user:status:${recipientId}`;

    const isActive = await redis.get(activeCacheKey);

    if(isActive && isActive !== 'online') {
      const pushNotification = { recipientId, senderId, type, title, resourceType, resourceId }
      await addJob('notification:push')
    }
  }
}

module.exports = NotificationService;
