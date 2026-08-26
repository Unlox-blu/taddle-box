'use strict';

require('dotenv').config();

const http = require('http');
const app = require('./src/app');
const config = require('./src/config/app.config');
const pool = require('./src/config/database');
const redis = require('./src/config/redis');
const { initializeSockets } = require('./src/sockets');
const { startJobWorker } = require('./src/jobs/workers/backgroundjob/job.worker');
require('./src/workers/redis.subscriber');
const { logger } = require('./src/middlewares/logger.middleware');
const CircuitBreaker = require('./src/utils/circuitBreaker');

// ── Engine readiness state ───────────────────────────────────────────────
const engineReady = {
  postgres: false,
  redis: false,
  pluginsLoaded: false,
};

// Unhandled error safety nets
process.on('unhandledRejection', (reason) => {
  logger.error('UNHANDLED REJECTION', { reason });
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  logger.error('UNCAUGHT EXCEPTION', { error: error.message, stack: error.stack });
  process.exit(1);
});

const withTimeout = (promise, ms, label) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} check timed out after ${ms}ms`)),
      ms
    );
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); }
    );
  });

// Bootstrap
const bootstrap = async () => {
  try {
    // Verify DB connection
    await withTimeout(pool.query('SELECT 1'), 15000, 'PostgreSQL');
    engineReady.postgres = true;
    logger.info('PostgreSQL connected');

    // Verify Redis connection
    await withTimeout(redis.ping(), 15000, 'Redis');
    engineReady.redis = true;
    logger.info('Redis connected');

    // Load game plugins
    require('./src/modules/game/engine');
    engineReady.pluginsLoaded = true;
    logger.info('Game plugins loaded');

    // Create HTTP server
    const server = http.createServer(app);

    // ── Health endpoints ──────────────────────────────────────────────
    // Liveness: process is alive
    server.on('request', (req, res) => {
      if (req.url === '/health/live' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'alive', timestamp: new Date().toISOString() }));
        return;
      }

      if (req.url === '/health/ready' && req.method === 'GET') {
        const ready = engineReady.postgres && engineReady.redis && engineReady.pluginsLoaded;
        const status = ready ? 200 : 503;
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: ready ? 'ready' : 'not_ready',
          postgres: engineReady.postgres,
          redis: engineReady.redis,
          pluginsLoaded: engineReady.pluginsLoaded,
          timestamp: new Date().toISOString(),
        }));
        return;
      }
    });

    // Initialize Socket.io
    initializeSockets(server);
    logger.info('Socket.io initialized');

    // Start outbox worker
    const outboxWorker = require('./src/workers/outbox.worker');
    outboxWorker.start();
    logger.info('Outbox worker started');

    // Run game resolution sweeper every minute
    const { resolveAbandonedMatches, resolveTournaments, resolveExpiredLobbies, resolveExpiredMatches, resolveBotFillingLobbies, expireAbandonedSessions } = require('./src/modules/game/game.resolution.job');

    // ── Circuit breakers: skip sweepers when the DB is unreachable ──────
    // Each sweeper group gets its own breaker so a fast-failing lobby sweep
    // doesn't block the slower 60s tournament sweep from probing.
    const sweeperBreaker = new CircuitBreaker({
      name: 'sweepers-60s',
      failThreshold: 2,
      baseBackoffMs: 30_000,
      maxBackoffMs: 300_000,
      logger: ({ level, message }) => logger[level] || logger.info(message),
    });
    const lobbyBreaker = new CircuitBreaker({
      name: 'lobby-2.5s',
      failThreshold: 2,
      baseBackoffMs: 15_000,
      maxBackoffMs: 120_000,
      logger: ({ level, message }) => logger[level] || logger.info(message),
    });

    const logSettled = (label, results) => {
      results.forEach((r, i) => {
        if (r.status === 'rejected') {
          logger.error(`Error sweeping ${label}[${i}]`, r.reason);
        }
      });
    };

    setInterval(() => {
      sweeperBreaker.run(async () => {
        const results = await Promise.allSettled([
          resolveAbandonedMatches(),
          resolveTournaments(),
          resolveExpiredMatches(),
          expireAbandonedSessions(),
        ]);
        logSettled('sweepers-60s', results);
      });
    }, 60000);

    // Check for expired matchmaking lobbies every 2.5 seconds
    setInterval(() => {
      lobbyBreaker.run(async () => {
        const results = await Promise.allSettled([
          resolveExpiredLobbies(),
          resolveBotFillingLobbies(),
        ]);
        logSettled('lobby-2.5s', results);
      });
    }, 2500);

    // Start server
    server.listen(config.PORT, async () => {
      logger.info(`Server running on port ${config.PORT} [${config.NODE_ENV}]`);

      if (config.NODE_ENV === 'development' && process.env.NGROK_AUTHTOKEN && process.env.NGROK_DOMAIN) {
        try {
          const ngrok = require('@ngrok/ngrok');
          const listener = await ngrok.forward({
            addr: config.PORT,
            authtoken: process.env.NGROK_AUTHTOKEN,
            domain: process.env.NGROK_DOMAIN
          });
          logger.info(`Ngrok tunnel established at: ${listener.url()}`);
        } catch (ngrokErr) {
          logger.error('Failed to start ngrok', { error: ngrokErr.message });
        }
      }
    });

    // Graceful shutdown
    const shutdown = async (signal) => {
      logger.info(`${signal} received. Graceful shutdown...`);
      outboxWorker.stop();
      server.close(async () => {
        await pool.end();
        await redis.quit();
        logger.info('Server closed. Goodbye.');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    logger.error('Failed to start server', { error: error.message });
    process.exit(1);
  }
};

bootstrap();
