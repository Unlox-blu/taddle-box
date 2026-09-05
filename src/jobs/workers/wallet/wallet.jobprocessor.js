'use strict';

const { logger } = require('../../../middlewares/logger.middleware');

/**
 * wallet:expire_stale_recharges
 * Marks pending topup transactions as failed if they are older than 30 minutes.
 * Runs every 30 minutes via BullMQ repeatable job.
 * Covers cases where PayU never sent a redirect or IPN (user closed app,
 * network failure, server was briefly down during the redirect).
 */
module.exports = async (job) => {
  if (job.name !== 'expire_stale_recharges') return;

  const { walletService } = require('../../../modules/wallet/wallet.container');
  const result = await walletService.expireStalePendingRecharges({ thresholdMinutes: 30 });

  if (result.expired > 0) {
    logger.info(`[WalletJob] Expired ${result.expired} stale pending recharge(s).`);
  }
};
