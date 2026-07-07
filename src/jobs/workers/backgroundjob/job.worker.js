'use strict';

const { Worker } = require('bullmq');
const redis = require('../../../config/redis');
const { logger } = require('../../../middlewares/logger.middleware');
const jobProcessor = require('./job.processor');

const startJobWorker = () => {
  const worker = new Worker(
    'job',
    jobProcessor,
    { connection: redis, concurrency: 5 }
  );

  worker.on('failed', (job, err) => {
    logger.error(`[JobWorker] Job failed: ${job?.name}`, { id: job?.id, error: err.message });
  });

  return worker;
};

module.exports = { startJobWorker };
