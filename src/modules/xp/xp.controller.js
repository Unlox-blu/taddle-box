'use strict';

const { apiResponse } = require('../../utils/response.util');
const { getPaginationParams, paginationMeta } = require('../../utils/pagination.util');

class XpController {
  constructor({ xpService }) {
    this.xpSvc = xpService;
  }

  createXPwallet = async (req, res, next) => {
    try {
      const userId = req.userId;
      const xpWallet = await this.xpSvc.createXPwallet({userId});
      res.json(apiResponse(xpWallet, "XP wallet created successfuly"));
    } catch (error) {
      next(error);
    }
  };

  getXP = async (req, res, next) => {
    try {
      const userId = req.userId;
      const xp = await this.xpSvc.getXP({userId});
      res.json(apiResponse(xp, "XP fetched successfuly"));
    } catch (error) {
      next(error);
    }
  };

  getTransactions = async (req, res, next) => {
    try {
      const userId = req.userId;
      const { limit, offset, page } = getPaginationParams(req.query);
      const { transactions, total } = await this.xpSvc.getTransactions({userId, limit, offset});
      res.json(
        apiResponse(transactions, 'Transactions fetched', paginationMeta(total, page, limit))
      );
    } catch (error) {
      next(error);
    }
  };

  creditXP = async (req, res, next) => {
    try {
      const userId = req.userId;
      const { xp, transactionType, sourceType } = req.body;
      const order = await this.xpSvc.creditXP({userId, xp, transactionType, sourceType});
      res.json(apiResponse(order, 'Order created. Open Razorpay checkout.'));
    } catch (error) {
      next(error);
    }
  };

  debitXP = async (req, res, next) => {
    try {
      const userId = req.userId;
      const { xp, transactionType, sourceType } = req.body;
      const order = await this.xpSvc.debitXP({userId, xp, transactionType, sourceType});
      res.json(apiResponse(order, 'Order created. Open Razorpay checkout.'));
    } catch (error) {
      next(error);
    }
  };
}

module.exports = XpController;
