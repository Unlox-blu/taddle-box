'use strict';

const { apiResponse } = require('../../utils/response.util');

class LeaderboardController {
  constructor({ leaderboardService }) {
    this.leaderboardSvc = leaderboardService;
  }

  getWeeklyLeaderboards = async (req, res, next) => {
    try {
      const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
      const leaderboards = await this.leaderboardSvc.getWeeklyLeaderboards({limit});
      res.json(apiResponse(leaderboards, 'weekly leaderboards fetched successfully'));
    } catch (error) {
      next(error);
    }
  };
}

module.exports = LeaderboardController;
