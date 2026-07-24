'use strict';

// Worker entry point — started separately by PM2 in fork mode.
// Do NOT run this in cluster mode: BullMQ workers coordinate via Redis, and multiple clustered instances would duplicate job processing.

require('dotenv').config();

const { startJobWorker } = require('./backgroundjob/job.worker');


const jobWorker = startJobWorker()

console.info('[Workers] Email, Notification, Delivery and Video workers started');

// Graceful shutdown
const shutdown = async (signal) => {
  console.info(`[Workers] ${signal} received — closing workers gracefully...`);
  await Promise.all([
    jobWorker.close(),
  ]);
  console.info('[Workers] All workers shut down cleanly');
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
