'use strict';

const { Worker } = require('bullmq');
const redis = require('../../../config/redis');
const { logger } = require('../../../middlewares/logger.middleware');
const { QUEUES } = require('../../../modules/notification/notification.constants');
const { pushService } = require('../../../modules/push/push.container');

const startNotificationDeliveryWorker = () => {
  const worker = new Worker(
    QUEUES.NOTIFICATION_DELIVERY,
    async (job) => {
      const payload = job.data || {};
      logger.info(`[NotifDeliveryWorker] Processing: ${payload.type}`, { id: job.id, recipientId: payload.recipientId });
      if (!payload.recipientId) return null;

      return pushService.sendToUser({
        userId: payload.recipientId,
        title: payload.title,
        message: payload.message,
        data: { notificationId: payload.notificationId, type: payload.type },
      });
    },
    { connection: redis, concurrency: 5 }
  );

  worker.on('failed', (job, err) => {
    logger.error(`[NotifDeliveryWorker] Failed: ${job?.name}`, { id: job?.id, error: err.message });
  });

  return worker;
};

module.exports = { startNotificationDeliveryWorker };
