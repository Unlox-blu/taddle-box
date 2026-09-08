'use strict';

const { apiResponse } = require('../../utils/response.util');
const { getPaginationParams, paginationMeta } = require('../../utils/pagination.util');
const { timeToCutoff } = require('../../utils/time.util');

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

  // `q` searches the full XP history server-side (type/source/status/amount)
  // so the app's wallet search isn't capped at the first page.
  getTransactions = async (req, res, next) => {
    try {
      const userId = req.userId;
      const { limit, offset, page } = getPaginationParams(req.query);
      const q = req.query.q || '';
      // TIME window + SORT mirror global search: 'top' = biggest XP amount
      // first, everything else newest-first.
      const timeCutoff = timeToCutoff(req.query?.time);
      const sort = req.query?.sort ? String(req.query.sort) : 'latest';
      const { transactions, total } = await this.xpSvc.getTransactions({userId, limit, offset, q, timeCutoff, sort});
      res.json(
        apiResponse(transactions, 'Transactions fetched', paginationMeta(total, page, limit))
      );
    } catch (error) {
      next(error);
    }
  };

  getDailyLoginStatus = async (req, res, next) => {
    try {
      const status = await this.xpSvc.getDailyLoginStatus({ userId: req.userId });
      res.json(apiResponse(status, 'Daily login status fetched'));
    } catch (error) {
      next(error);
    }
  };

  // The ONLY client-driven earn path. The client sends an event name plus a
  // minimal payload; the backend owns the amount, source string, and
  // verification (see xp.claim.js).
  claimReward = async (req, res, next) => {
    try {
      const userId = req.userId;
      const { event, payload } = req.body;
      const order = await this.xpSvc.claimReward({ userId, event, payload });
      res.json(apiResponse(order, 'XP claimed successfully'));
    } catch (error) {
      next(error);
    }
  };
}

module.exports = XpController;