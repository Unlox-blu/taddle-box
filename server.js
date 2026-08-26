'use strict';

require('dotenv').config();

const http = require('http');
const app = require('./src/app');
const config = require('./src/config/app.config');
const pool = require('./src/config/database');
const redis = require('./src/config/redis');
const { initializeSockets } = require('./src/sockets');
const { startJobWorker } = require('./src/jobs/workers/backgroundjob/job.worker');
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
    const timer = setTimeout(() => reject(new Error(`${label} check timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });

// Bootstrap
const bootstrap = async () => {
  try {
    // Verify DB connection (non-fatal — server starts in degraded mode if DB is down)
    try {
      await withTimeout(pool.query('SELECT 1'), 15000, 'PostgreSQL');
      engineReady.postgres = true;
      logger.info('PostgreSQL connected');
    } catch (dbErr) {
      logger.error(`PostgreSQL unavailable: ${dbErr.message} — starting in degraded mode`);
      engineReady.postgres = false;
    }

    // Verify Redis connection
    await withTimeout(redis.ping(), 15000, 'Redis');
    engineReady.redis = true;
    logger.info('Redis connected');

    // Verify Redis Subscriber connection
    const subscriber = require('./src/workers/redis.subscriber');
    await withTimeout(subscriber.ping(), 15000, 'Redis Subscriber');
    logger.info('Redis Subscriber ready');

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
        res.end(
          JSON.stringify({
            status: ready ? 'ready' : 'not_ready',
            postgres: engineReady.postgres,
            redis: engineReady.redis,
            pluginsLoaded: engineReady.pluginsLoaded,
            timestamp: new Date().toISOString(),
          })
        );
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
    const resolutionJob = require('./src/modules/game/game.resolution.job');
    const {
      resolveAbandonedMatches,
      resolveTournaments,
      resolveExpiredLobbies,
      resolveExpiredMatches,
      resolveBotFillingLobbies,
      expireAbandonedSessions,
    } = resolutionJob;

    // ── Circuit breakers: skip sweepers when the DB is unreachable ──────
    // Each sweeper group gets its own breaker so a fast-failing lobby sweep
    // doesn't block the slower 60s tournament sweep from probing.
    const sweeperBreaker = new CircuitBreaker({
      name: 'sweepers-60s',
      failThreshold: 2,
      baseBackoffMs: 30_000,
      maxBackoffMs: 300_000,
      logger: ({ level, message }) => (logger[level] || logger.info)(message),
    });
    const lobbyBreaker = new CircuitBreaker({
      name: 'lobby-2.5s',
      failThreshold: 2,
      baseBackoffMs: 15_000,
      maxBackoffMs: 120_000,
      logger: ({ level, message }) => (logger[level] || logger.info)(message),
    });

    // Wire the DB health gate: when a circuit breaker is OPEN, sweepers
    // skip pool.connect() entirely — no Client objects allocated, no 10s
    // connection timeouts piling up in memory.
    const updateDbHealth = () => {
      if (typeof resolutionJob.setDbHealthy === 'function') {
        resolutionJob.setDbHealthy(
          sweeperBreaker.state !== 'OPEN' && lobbyBreaker.state !== 'OPEN'
        );
      }
    };

    const logSettled = (label, results) => {
      results.forEach((r, i) => {
        if (r.status === 'rejected') {
          // Log only the message, not the full error object (saves memory)
          logger.warn(`[sweeper] ${label}[${i}] — ${r.reason?.message || 'unknown'}`);
        }
      });
      // If ALL results failed, re-throw so the circuit breaker trips.
      // Promise.allSettled never rejects, so the breaker would otherwise
      // see every call as a success and never open.
      const allFailed = results.length > 0 && results.every((r) => r.status === 'rejected');
      if (allFailed) {
        throw new Error(`[sweeper] ${label} — all ${results.length} queries failed`);
      }
    };

    setInterval(() => {
      updateDbHealth();
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
      updateDbHealth();
      lobbyBreaker.run(async () => {
        const results = await Promise.allSettled([
          resolveExpiredLobbies(),
          resolveBotFillingLobbies(),
        ]);
        logSettled('lobby-2.5s', results);
      });
    }, 2500);

    // ── System health log (every 60s, all processes in one line) ──
    const os = require('os');
    const cluster = require('cluster');
    const fs = require('fs');
    const totalMemGB = (os.totalmem() / 1073741824).toFixed(1);
    const _getStorage = () =>
      new Promise((resolve) => {
        fs.statfs('/', (err, stats) => {
          if (err) return resolve('??/??GB');
          const total = ((stats.blocks * stats.bsize) / 1073741824).toFixed(1);
          const free = ((stats.bavail * stats.bsize) / 1073741824).toFixed(1);
          const used = (((stats.blocks - stats.bavail) * stats.bsize) / 1073741824).toFixed(1);
          resolve(`${used}/${total}GB`);
        });
      });
    // Every process publishes its stats to Redis; worker 1 aggregates and logs.
    const logHealth = async () => {
      try {
        const m = process.memoryUsage();
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
        // Publish own stats with 120s TTL
        await redis.set(`health:stats:${process.pid}`, JSON.stringify(stats), 'EX', 120);

        // Only worker 1 reads all stats and logs the combined line
        const cluster = require('cluster');
        if (cluster.isWorker && cluster.worker?.id !== 1) return;

        // Scan for all health:stats:* keys
        const keys = [];
        let cursor = '0';
        do {
          const [next, found] = await redis.scan(cursor, 'MATCH', 'health:stats:*', 'COUNT', 100);
          cursor = next;
          keys.push(...found);
        } while (cursor !== '0');

        if (keys.length === 0) return;
        const values = await redis.mget(keys);
        const procs = values.map((v) => JSON.parse(v)).sort((a, b) => a.pid - b.pid);

        const storage = await _getStorage();
        const freeMemGB = (os.freemem() / 1073741824).toFixed(1);
        const usedMemGB = ((os.totalmem() - os.freemem()) / 1073741824).toFixed(1);
        const pids = procs.map((p) => p.pid).join(', ');
        const totalRssMB = procs.reduce((acc, p) => acc + p.rss, 0);

        logger.info(
          `[HEALTH] PID's: ${pids}` +
            ` | RAM USAGE: ${totalRssMB}MB of ${usedMemGB}/${totalMemGB}GB` +
            ` | ROM USAGE: ${storage}` +
            ` | DB USAGE: pool=${pool.totalCount}/${pool.options.max} idle=${pool.idleCount}`
        );
      } catch (e) {
        /* non-fatal */
      }
    };
    const _healthLog = setInterval(logHealth, 60_000);
    process.on('SIGINT', () => {
      clearInterval(_healthLog);
      redis.del(`health:stats:${process.pid}`).catch(() => {});
    });
    process.on('SIGTERM', () => clearInterval(_healthLog));

    server.listen(config.PORT, async () => {
      if (
        config.NODE_ENV === 'development' &&
        process.env.NGROK_AUTHTOKEN &&
        process.env.NGROK_DOMAIN
      ) {
        try {
          const ngrok = require('@ngrok/ngrok');
          const listener = await ngrok.forward({
            addr: config.PORT,
            authtoken: process.env.NGROK_AUTHTOKEN,
            domain: process.env.NGROK_DOMAIN,
          });
          logger.info(`Ngrok tunnel established at: ${listener.url()}`);
        } catch (ngrokErr) {
          logger.error('Failed to start ngrok', { error: ngrokErr.message });
        }
      }

      // Await the asynchronous Nodemailer verification so it logs BEFORE [HEALTH]
      const transporter = require('./src/config/nodemailer');
      if (typeof transporter.verifyConnection === 'function') {
        await transporter.verifyConnection();
      }

      logger.info(`Taddle Server Started Succesfully! [Port: ${config.PORT}] [${config.NODE_ENV}]`);
      logHealth(); // Initial run immediately after ALL bootup finishes (including ngrok)
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
    logger.error(`Failed to start server: ${error.message}`);
    process.exit(1);
  }
};

bootstrap();
