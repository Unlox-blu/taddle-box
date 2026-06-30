'use strict';

const { Worker } = require('bullmq');
const redis = require('../../../config/redis');
const { logger } = require('../../../middlewares/logger.middleware');
const videoJobProcessor = require('./video.jobprocessor');

const startVideoWorker = () => {
  const worker = new Worker(
    'video',
    videoJobProcessor,
    { connection: redis, concurrency: 3 }
  );

  worker.on('failed', (job, err) => {
    logger.error(`[VideoWorker] Failed: ${job?.name}`, { id: job?.id, error: err.message });
  });

  return worker;
};

module.exports = { startVideoWorker };
