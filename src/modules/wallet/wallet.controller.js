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

  createTopup = async (req, res, next) => {
    try {
      const userId = req.userId;
      const { amountCents } = req.body;
      const order = await this.walletSvc.createTopup({userId, amountCents});
      res.json(apiResponse(order, 'Order created. Open Razorpay checkout.'));
    } catch (error) {
      next(error);
    }
  };
}

module.exports = WalletController;
