'use strict';

const { Worker } = require('bullmq');
const redis = require('../../../config/redis');
const { logger } = require('../../../middlewares/logger.middleware');
const emailJobProcessor = require('./email.jobprocessor');

const startEmailWorker = () => {
  const worker = new Worker(
    'email',
    emailJobProcessor,
    { connection: redis, concurrency: 5 }
  );

  worker.on('failed', (job, err) => {
    logger.error(`[EmailWorker] Job failed: ${job?.name}`, { id: job?.id, error: err.message });
  });

  return worker;
};

module.exports = { startEmailWorker };
