'use strict';

const { apiResponse } = require('../../utils/response.util');
const { getPaginationParams, paginationMeta } = require('../../utils/pagination.util');

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

  getTransactions = async (req, res, next) => {
    try {
      const userId = req.userId;
      const { limit, offset, page } = getPaginationParams(req.query);
      const { transactions, total } = await this.walletSvc.getTransactions({userId, limit, offset});
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
      const { txnid } = req.query;
      const data = await this.walletSvc.completeRecharge({ txnid, params: req.query });
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
      // In production, this route should be authenticated via API KEY or Webhook Signature
      // For now, assuming the external backend securely passed userId
      const { userId, amountCents, externalTxId } = req.body;
      const data = await this.walletSvc.confirmWithdrawalWebhook({ userId, amountCents, externalTxId });
      res.json(apiResponse(data, 'Withdrawal confirmed and deducted.'));
    } catch (error) {
      next(error);
    }
  };
}

module.exports = WalletController;
