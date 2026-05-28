'use strict';

const { apiResponse } = require('../utils/response.util');
const { getPaginationParams, paginationMeta } = require('../utils/pagination.util');

class WalletController {
  constructor({ walletService }) {
    this.walletSvc = walletService;
  }

  getWallet = async (req, res, next) => {
    try {
      const wallet = await this.walletSvc.getWallet(req.userId);
      res.json(apiResponse(wallet));
    } catch (err) { next(err); }
  };

  getTransactions = async (req, res, next) => {
    try {
      const { limit, offset, page } = getPaginationParams(req.query);
      const { transactions, total } = await this.walletSvc.getTransactions(req.userId, limit, offset);
      res.json(apiResponse(transactions, 'Transactions fetched', paginationMeta(total, page, limit)));
    } catch (err) { next(err); }
  };

  createTopup = async (req, res, next) => {
    try {
      const order = await this.walletSvc.createTopup(req.userId, req.body.amountCents);
      res.json(apiResponse(order, 'Order created. Open Razorpay checkout.'));
    } catch (err) { next(err); }
  };
}

module.exports = WalletController;
