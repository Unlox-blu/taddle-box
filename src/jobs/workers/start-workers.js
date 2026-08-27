'use strict';

// Worker entry point — started separately by PM2 in fork mode.
// Do NOT run this in cluster mode: BullMQ workers coordinate via Redis, and multiple clustered instances would duplicate job processing.

require('dotenv').config();

const { startJobWorker } = require('./backgroundjob/job.worker');


const jobWorker = startJobWorker()

console.info('[Workers] Email, Notification, Delivery and Video workers started');

const redis = require('../../config/redis');
const pool = require('../../config/database');

const publishHealth = async () => {
  try {
    const m = process.process?.memoryUsage?.() || process.memoryUsage();
    const stats = {
      pid: process.pid,
      rss: Math.round(m.rss / 1024 / 1024),
      heap: Math.round(m.heapUsed / 1024 / 1024),
      pool: `${pool.totalCount}/${pool.options.max}`,
      idle: pool.idleCount,
      handles: process._getActiveHandles().length,
      reqs: process._getActiveRequests().length,
      ts: Date.now(),
    };
    await redis.set(`health:stats:${process.pid}`, JSON.stringify(stats), 'EX', 120);
  } catch (e) {}
};
publishHealth();
const healthTimer = setInterval(publishHealth, 60_000);

// Graceful shutdown
const shutdown = async (signal) => {
  console.info(`[Workers] ${signal} received — closing workers gracefully...`);
  clearInterval(healthTimer);
  redis.del(`health:stats:${process.pid}`).catch(() => {});
  
  await Promise.all([
    jobWorker.close(),
  ]);
  console.info('[Workers] All workers shut down cleanly');
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
