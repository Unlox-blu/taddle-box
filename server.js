'use strict';

require('dotenv').config();

const http = require('http');
const app = require('./src/app');
const config = require('./src/config/app.config');
const pool = require('./src/config/database');
const redis = require('./src/config/redis');
const { initializeSockets } = require('./src/sockets');
const { startJobWorker } = require('./src/jobs/workers/backgroundjob/job.worker');
require('./src/jobs/workers/start-workers')
// const { startEmailWorker } = require('./src/jobs/workers/email/email.worker');
// const { startNotificationWorker } = require('./src/jobs/workers/notification/notification.worker');
// const { startVideoWorker } = require('./src/jobs/workers/video/video.worker');
const { logger } = require('./src/middlewares/logger.middleware');

// Unhandled error safety nets
process.on('unhandledRejection', (reason) => {
  logger.error('UNHANDLED REJECTION', { reason });
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  logger.error('UNCAUGHT EXCEPTION', { error: error.message, stack: error.stack });
  process.exit(1);
});

// Bootstrap
const bootstrap = async () => {
  try {
    // Verify DB connection
    await pool.query('SELECT 1');
    logger.info('PostgreSQL connected');

    // Verify Redis connection
    await redis.ping();
    logger.info('Redis connected');

    // Create HTTP server
    const server = http.createServer(app);

    // Initialize Socket.io
    initializeSockets(server);
    logger.info('Socket.io initialized');

    // Start BullMQ workers
    // startEmailWorker();
    // startNotificationWorker();
    // startVideoWorker();
    // startJobWorker()
    // logger.info('BullMQ workers started');

    // Run game resolution sweeper every minute
    const { resolveAbandonedMatches, resolveTournaments, resolveExpiredLobbies, resolveExpiredMatches, resolveBotFillingLobbies } = require('./src/modules/game/game.resolution.job');
    setInterval(() => {
      resolveAbandonedMatches().catch(err => logger.error('Error sweeping abandoned matches', err));
      resolveTournaments().catch(err => logger.error('Error sweeping tournaments', err));
      // Terminate MATCHED tickets whose match the player never entered
      // (older than the 10-minute reconnect-replay freshness window).
      resolveExpiredMatches().catch(err => logger.error('Error sweeping expired matches', err));
    }, 60000);
    
    // Check for expired matchmaking lobbies every 2.5 seconds
    setInterval(() => {
      resolveExpiredLobbies().catch(err => logger.error('Error sweeping expired lobbies', err));
      // Gradually fill open lobby slots with bots (starts 15s into the 30s window)
      resolveBotFillingLobbies().catch(err => logger.error('Error sweeping bot-fill lobbies', err));
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
