'use strict';

const router = require('express').Router();
const crypto = require('crypto');
const { walletController } = require('../modules/wallet/wallet.container');
const { verifyToken }      = require('../middlewares/auth.middleware');
const config = require('../config/app.config');

// Auth for the admin withdrawal webhook: the admin backend must present the
// shared secret (X-Webhook-Secret) from WITHDRAWAL_WEBHOOK_SECRET env. Without
// it no payout can be confirmed/rejected — protects users' held balances.
const requireWebhookSecret = (req, res, next) => {
  const provided = req.headers['x-webhook-secret'];
  const expected = config.WITHDRAWAL_WEBHOOK_SECRET;
  // Timing-safe compare so a timing attack can't leak the secret.
  if (!expected || typeof provided !== 'string') {
    return res.status(401).json({ success: false, message: 'Unauthorized webhook' });
  }
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ success: false, message: 'Unauthorized webhook' });
  }
  next();
};

router.get('/me',                verifyToken,  walletController.getWallet);
router.get('/me/transactions',   verifyToken,  walletController.getTransactions);

// Core Redemption Flows
router.post('/upi',              verifyToken,  walletController.linkUPI);
router.post('/convert-xp',       verifyToken,  walletController.convertXpToCash);
router.post('/convert-cash-xp',  verifyToken,  walletController.convertCashToXp);
router.post('/withdraw/initiate',verifyToken,  walletController.initiateWithdrawal);

// Recharge (PayU) — init returns the auto-submit HTML form; result is the
// public redirect target PayU bounces the WebView to.
router.post('/recharge/init',    verifyToken,  walletController.initiateRecharge);
router.get('/recharge/result',                 walletController.completeRecharge);

// Webhooks for External (admin) Backend — secret-gated
router.post('/withdraw/confirm', requireWebhookSecret, walletController.confirmWithdrawalWebhook);
router.post('/withdraw/reject',  requireWebhookSecret, walletController.rejectWithdrawalWebhook);
// Backward-compatible alias of the old combined webhook endpoint (confirm-only)
router.post('/withdraw/webhook', requireWebhookSecret, walletController.confirmWithdrawalWebhook);

module.exports = router;
