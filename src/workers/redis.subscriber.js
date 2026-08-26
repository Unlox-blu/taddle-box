'use strict';

const Redis = require('ioredis');
const config = require('../config/app.config');
const { emitWalletUpdate } = require('../sockets/account.socket');
const { walletRepo } = require('../modules/wallet/wallet.container');
const { logger } = require('../middlewares/logger.middleware');

// We need a dedicated Redis client for subscribing (ioredis requires it)
const subscriber = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  retryStrategy: (times) => Math.min(times * 50, 2000),
});

subscriber.on('ready', () => {
  // Subscribe to the wallet updates channel
  subscriber.subscribe('wallet_updated', (err) => {
    if (err) {
      logger.error('Failed to subscribe to wallet_updated:', { error: err.message });
    }
  });
});
subscriber.on('error', (err) => logger.error('Redis Subscriber error:', { error: err.message }));

// Listen for messages
subscriber.on('message', async (channel, message) => {
  if (channel === 'wallet_updated') {
    try {
      const { userId } = JSON.parse(message);
      if (!userId) return;

      // Fetch the latest real balance from the database
      const wallet = await walletRepo.findByUserId(userId);
      if (wallet) {
        // Emit socket event to the user's phone to trigger an instant refresh
        emitWalletUpdate(userId, wallet.balanceCents);
      }
    } catch (err) {
      logger.error('Error processing wallet_updated pubsub message:', { error: err.message });
    }
  }
});

module.exports = subscriber;
