'use strict';

const NotificationModel = require('./notification.model');
const NotificationBatchService = require('./notification.batch');
const NotificationSchedulerService = require('./notification.scheduler');
const NotificationRedisService = require('./notification.redis');
const notificationRepository = require('./notification.repository');
const { addNotificationDeliveryJob } = require('../../jobs/queues/notification.queue');
const { DEFAULT_NOTIFICATION_DEFINITIONS, PRIORITY, normalizeType, resolveNotificationPolicy } = require('./notification.constants');
const {emitNotification, emitWalletUpdate} = require('../../sockets/notification.socket');
const { addJob } = require('../../jobs/queues/job.queue');

class NotificationService {
  constructor({
    notificationRepository,
    pushService,
    batchService = new NotificationBatchService(),
    schedulerService = new NotificationSchedulerService(),
    redisService = new NotificationRedisService(),
  } = {}) {
    this.notifRepo = notificationRepository;
    this.pushSvc = pushService;
    this.batchService = batchService;
    this.schedulerService = schedulerService;
    this.redisService = redisService;
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

  async create({ recipientId, type, resourceType, resourceId, senderId = null, content = null }) {
    return this.publishNotification({
      recipientId, 
      type,
      resourceType,
      resourceId,
      senderId,
      content
    });
  }

  async publishNotification(event) {
    const policy = resolveNotificationPolicy(event);
    const { recipientId, type, resourceType, resourceId, senderId, content } = event

    const title = policy.type === 'COMMENT' ? content ? `comment: ${content}` : policy.title : policy.title
    const mode = policy.batch ? 'BATCH' : 'SINGLE'
    
    const notification = { 
      recipientId,
      notificationType: policy.type,
      resourceType,
      resourceId,
      title: title,
      mode: mode,
      senderIds: [senderId],
      senderCount: 1,
      isRead: false,
      createdAt: new Date().toISOString(), 
      updatedAt: new Date().toISOString() 
    };

    
    if(policy.batch){
      const batchKey = this.batchService.buildBatchKey({ recipientId, type: policy.type, resourceType, resourceId })
      const cachedNotifications = await this.batchService.getBatch(batchKey)
      
      if(cachedNotifications) {
        if(Array.isArray(cachedNotifications) && cachedNotifications.length <= 4) {
          notification.mode = 'SINGLE'
          const updatedNotifications = [...cachedNotifications, notification]

          await this.batchService.saveBatch({ batchKey, payload: updatedNotifications })

          emitNotification(recipientId, notification)
        }
        else {
          const batchNotification = cachedNotifications[cachedNotifications.length - 1]
          batchNotification.mode = 'BATCH'
          batchNotification.senderCount = cachedNotifications.length
          batchNotification.title = `${cachedNotifications.length} ${policy.title}`
          batchNotification.senderIds.push(senderId)
          batchNotification.senderIds = batchNotification.senderIds.slice(-2);

          cachedNotifications[ cachedNotifications.length - 1 ] = batchNotification;

          await this.batchService.saveBatch({ batchKey, payload: cachedNotifications })

          emitNotification(recipientId, batchNotification)
        }
      }
      else{
        await this.batchService.saveBatch({ batchKey, payload: notification })
        addJob('notification:db_save', {batchKey}, {delay: 30 * 60 * 1000})
        emitNotification(recipientId, notification)
      }
    }

    if (policy.batch) {

      const batchKey = `notification:batch:${policy.type}:${event.recipientId}:${event.entityType || 'default'}:${event.entityId || 'default'}`;
      await this.schedulerService.schedule({
        key: batchKey,
        runAt: new Date(Date.now() + Math.max(policy.delay, 30000)),
        payload: { recipientId: event.recipientId, type: policy.type, entityId: event.entityId, payload: persisted },
      });
    }

    if (policy.socket) {
      emitNotification(event.recipientId, persisted);
    }

    const recipientIsOnline = await this.redisService.isUserOnline(event.recipientId);
    const effectivePolicy = { ...policy, push: policy.push && !recipientIsOnline };

    const cooldownActive = await this.redisService.hasCooldown({
      userId: event.recipientId,
      type: policy.type,
      entityId: event.entityId || 'default',
    });

    if (cooldownActive) {
      effectivePolicy.push = false;
    }

    if (!effectivePolicy.push) return persisted;

    const quietHoursDelay = this.getQuietHoursDelay(effectivePolicy.priority);
    const deliveryDelay = quietHoursDelay > 0 ? quietHoursDelay : effectivePolicy.delay;
    const jobId = `notification:${event.recipientId}:${policy.type}:${event.entityId || 'default'}`;

    const deliveryPayload = {
      notificationId: persisted.id,
      recipientId: event.recipientId,
      actorId: event.actorId,
      type: policy.type,
      title: persisted.title,
      message: persisted.message,
      entityType: event.entityType,
      entityId: event.entityId,
      priority: effectivePolicy.priority,
      policy: effectivePolicy,
      jobId,
    };

    addNotificationDeliveryJob(deliveryPayload, {
      jobId: jobId,
      delay: deliveryDelay,
    });

    await this.redisService.setCooldown({
      userId: event.recipientId,
      type: policy.type,
      entityId: event.entityId || 'default',
      ttl: Math.max(60, Math.floor((policy.cooldown || 300000) / 1000)),
    });

    return persisted;
  }




  async create({key}) {
    try {
      console.log(key)
    } catch (error) {
      throw error
    }
  }

  async getAll({ userId, limit, offset, unreadOnly }) {
    const { notifications, total } = await this.notifRepo.findByUser(userId, limit, offset, unreadOnly);
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
    const existing = await this.notifRepo.findByUserId(userId);
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
}

module.exports = NotificationService;
