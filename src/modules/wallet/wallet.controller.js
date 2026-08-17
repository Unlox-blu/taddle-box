'use strict';

const { apiResponse } = require('../../utils/response.util');
const { getPaginationParams, paginationMeta } = require('../../utils/pagination.util');
const { timeToCutoff } = require('../../utils/time.util');

class WalletController {
  constructor({ walletService }) {
    this.walletSvc = walletService;
  }

  getWallet = async (req, res, next) => {
    try {
      const userId = req.userId;
      const wallet = await this.walletSvc.getWallet({userId});
      res.json(apiResponse(wallet));
    } catch (error) {
      next(error);
    }
  };

  getWalletSummary = async (req, res, next) => {
    try {
      const summary = await this.walletSvc.getWalletSummary({userId: req.userId});
      res.json(apiResponse(summary, 'Wallet summary fetched'));
    } catch (error) {
      next(error);
    }
  };

  // `q` searches the full history server-side (description/type/category/
  // status/amount) so the app's wallet search isn't capped at the first page.
  getTransactions = async (req, res, next) => {
    try {
      const userId = req.userId;
      const { limit, offset, page } = getPaginationParams(req.query);
      const q = req.query.q || '';
      // TIME window + SORT mirror global search: 'top' = biggest amount
      // first, everything else newest-first.
      const timeCutoff = timeToCutoff(req.query?.time);
      const sort = req.query?.sort ? String(req.query.sort) : 'latest';
      const { transactions, total } = await this.walletSvc.getTransactions({userId, limit, offset, q, timeCutoff, sort});
      res.json(
        apiResponse(transactions, 'Transactions fetched', paginationMeta(total, page, limit))
      );
    } catch (error) {
      next(error);
    }
  };

  convertXpToCash = async (req, res, next) => {
    try {
      const userId = req.userId;
      const { xpAmount } = req.body;
      const data = await this.walletSvc.convertXpToCash({ userId, xpAmount });
      res.json(apiResponse(data, 'XP converted to Cash successfully.'));
    } catch (error) {
      next(error);
    }
  };

  initiateRecharge = async (req, res, next) => {
    try {
      const userId = req.userId;
      const { amountCents } = req.body;
      const data = await this.walletSvc.initiateRecharge({ userId, amountCents });
      res.json(apiResponse(data, 'Recharge initiated.'));
    } catch (error) {
      next(error);
    }
  };

  // Public route hit by PayU's redirect — renders an HTML page for the WebView.
  completeRecharge = async (req, res, next) => {
    try {
      const txnid = req.query.txnid || req.body.txnid;
      const data = await this.walletSvc.completeRecharge({ txnid, params: { ...req.query, ...req.body } });
      res.type('html').send(data.html);
    } catch (error) {
      next(error);
    }
  };

  convertCashToXp = async (req, res, next) => {
    try {
      const userId = req.userId;
      const { amountCents } = req.body;
      const data = await this.walletSvc.convertCashToXp({ userId, amountCents });
      res.json(apiResponse(data, 'Cash converted to XP successfully.'));
    } catch (error) {
      next(error);
    }
  };

  linkUPI = async (req, res, next) => {
    try {
      const userId = req.userId;
      const { upiId } = req.body;
      const data = await this.walletSvc.linkUPI({ userId, upiId });
      res.json(apiResponse(data, 'UPI linked successfully.'));
    } catch (error) {
      next(error);
    }
  };

  initiateWithdrawal = async (req, res, next) => {
    try {
      const userId = req.userId;
      const { amountCents } = req.body;
      const data = await this.walletSvc.initiateWithdrawal({ userId, amountCents });
      res.json(apiResponse(data, 'Withdrawal initiated.'));
    } catch (error) {
      next(error);
    }
  };

  confirmWithdrawalWebhook = async (req, res, next) => {
    try {
      // Auth: the route-level middleware compares X-Webhook-Secret to the
      // env-configured shared secret, and the service re-verifies it too.
      const webhookSecret = req.headers['x-webhook-secret'];
      const { userId, amountCents, externalTxId } = req.body;
      const data = await this.walletSvc.confirmWithdrawalWebhook({ userId, amountCents, externalTxId, webhookSecret });
      res.json(apiResponse(data, 'Withdrawal confirmed and deducted.'));
    } catch (error) {
      next(error);
    }
  };

  rejectWithdrawalWebhook = async (req, res, next) => {
    try {
      const webhookSecret = req.headers['x-webhook-secret'];
      const { userId, externalTxId } = req.body;
      const data = await this.walletSvc.rejectWithdrawalWebhook({ userId, externalTxId, webhookSecret });
      res.json(apiResponse(data, 'Withdrawal rejected and refunded.'));
    } catch (error) {
      next(error);
    }
  };
}

module.exports = WalletController;
