'use strict';

// Worker entry point — started separately by PM2 in fork mode.
// Do NOT run this in cluster mode: BullMQ workers coordinate via Redis, and multiple clustered instances would duplicate job processing.

require('dotenv').config();

const { startEmailWorker } = require('../workers/email/email.worker');
const { startNotificationWorker } = require('../workers/notification/notification.worker');
const { startNotificationDeliveryWorker } = require('../workers/notification/delivery.worker');
const { startVideoWorker } = require('../workers/video/video.worker');
const { startJobWorker } = require('./backgroundjob/job.worker');

const emailWorker = startEmailWorker();
const notificationWorker = startNotificationWorker();
const notificationDeliveryWorker = startNotificationDeliveryWorker();
const jobWorker = startJobWorker()
const videoWorker = startVideoWorker();

console.info('[Workers] Email, Notification, Delivery and Video workers started');

// Graceful shutdown
const shutdown = async (signal) => {
  console.info(`[Workers] ${signal} received — closing workers gracefully...`);
  await Promise.all([
    emailWorker.close(),
    notificationWorker.close(),
    notificationDeliveryWorker.close(),
    jobWorker.close(),
    videoWorker.close(),
  ]);
  console.info('[Workers] All workers shut down cleanly');
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
