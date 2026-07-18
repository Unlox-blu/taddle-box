'use strict';

const { Worker } = require('bullmq');
const redis = require('../../../config/redis');
const { logger } = require('../../../middlewares/logger.middleware');
const { buildNotificationJobProcessor } = require('../../../modules/notification/notification.worker');

const startNotificationWorker = () => {
  const worker = new Worker(
    'notification',
    buildNotificationJobProcessor(),
    { connection: redis, concurrency: 10 }
  );

  worker.on('failed', (job, err) => {
    logger.error(`[NotifWorker] Failed: ${job?.name}`, { id: job?.id, error: err.message });
  });

  return worker;
};

module.exports = { startNotificationWorker };
