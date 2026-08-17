'use strict';

const { apiResponse } = require('../../utils/response.util');

const VALID_TYPES = ['feed', 'community', 'games', 'events'];

class LeaderboardController {
  constructor({ leaderboardService }) {
    this.leaderboardSvc = leaderboardService;
  }

  getWeeklyLeaderboards = async (req, res, next) => {
    try {
      const userId = req.userId;
      const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
      const type = req.query.type;
      if (type !== undefined && !VALID_TYPES.includes(type)) {
        return res.status(400).json(apiResponse(null, `type must be one of: ${VALID_TYPES.join(', ')}`));
      }
      const leaderboards = await this.leaderboardSvc.getWeeklyLeaderboards({limit, userId, type});
      res.json(apiResponse(leaderboards, 'weekly leaderboards fetched successfully'));
    } catch (error) {
      next(error);
    }
  };
}

module.exports = LeaderboardController;
