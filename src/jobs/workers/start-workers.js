'use strict';

// Worker entry point — started separately by PM2 in fork mode.
// Do NOT run this in cluster mode: BullMQ workers coordinate via Redis, and multiple clustered instances would duplicate job processing.

require('dotenv').config();

const { startEmailWorker } = require('./email.worker');
const { startNotificationWorker } = require('./notification.worker');
const { startVideoWorker } = require('./video.worker');

const emailWorker = startEmailWorker();
const notificationWorker = startNotificationWorker();
const videoWorker = startVideoWorker();

console.info('[Workers] Email, Notification and Video workers started');

// Graceful shutdown
const shutdown = async (signal) => {
  console.info(`[Workers] ${signal} received — closing workers gracefully...`);
  await Promise.all([
    emailWorker.close(),
    notificationWorker.close(),
    videoWorker.close(),
  ]);
  console.info('[Workers] All workers shut down cleanly');
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
