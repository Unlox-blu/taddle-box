'use strict';

const notificationRepository = require('./notification.repository');
const { emitNotification } = require('../../sockets/notification.socket');
const NotificationModel = require('./notification.model');
const { logger } = require('../../middlewares/logger.middleware');
const NotificationBatchService = require('./notification.batch');
const NotificationRedisService = require('./notification.redis');
const { PRIORITY, resolveNotificationPolicy } = require('./notification.constants');

const buildNotificationJobProcessor = ({
  repository = notificationRepository,
  batchService = new NotificationBatchService(),
  redisService = new NotificationRedisService(),
} = {}) => async (job) => {
  logger.info(`[NotifWorker] Processing: ${job.name}`, { id: job.id });

  const event = job.data || {};
  const policy = resolveNotificationPolicy(event);
  const persisted = await repository.create({
    recipientId: event.recipientId,
    senderId: event.actorId || null,
    type: policy.type,
    title: event.title || `${policy.type} notification`,
    message: event.message || null,
    resourceType: event.entityType || null,
    resourceId: event.entityId || null,
  });

  const formatted = NotificationModel.format(persisted);
  if (policy.socket) {
    emitNotification(event.recipientId, formatted);
  }

  if (policy.batch) {
    await batchService.addToBatch({
      recipientId: event.recipientId,
      entityType: event.entityType,
      entityId: event.entityId,
      type: policy.type,
      payload: formatted,
    });
  }

  if (policy.priority === PRIORITY.LOW) {
    await redisService.setCooldown({
      userId: event.recipientId,
      type: policy.type,
      entityId: event.entityId || 'default',
      ttl: 300,
    });
  }

  logger.info(`[NotifWorker] Done: ${job.name}`, { id: job.id });
  return formatted;
};

module.exports = { buildNotificationJobProcessor };
