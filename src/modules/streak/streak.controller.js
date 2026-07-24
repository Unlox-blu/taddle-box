'use strict';

const { apiResponse } = require('../../utils/response.util');
const { getPaginationParams, paginationMeta } = require('../../utils/pagination.util');

class StreakController {
  constructor({ streakService }) {
    this.streakSvc = streakService;
  }

  createOrUpdate = async (req, res, next) => {
    try {
        const userId = req.userId
        const { streak, weeklyBonusEarned } = await this.streakSvc.createOrUpdate(userId)
        res.status(201).json(apiResponse({ streak, weeklyBonusEarned }, 'New Streak created successfully'))
    } catch (error) {
        next(error)
    }
  }  

  getCurrentStreak = async (req, res, next) => {
    try {
        const userId = req.userId
        const streak = await this.streakSvc.getCurrentStreak(userId)
        res.json(apiResponse(streak, 'Streak fetched successfully'));
    } catch (error) {
        next(error)
    }
  }

  getStreakHistory = async (req, res, next) => {
    try {
        const userId = req.userId
        const { limit, offset, page } = getPaginationParams(req.query);
        const { streaks, total } = await this.streakSvc.getStreakHistory({userId, limit, offset});
        res.json(apiResponse(streaks, 'Streak fetched successfully', paginationMeta(total, page, limit)));
    } catch (error) {
        next(error)
    }
  }

}


module.exports = StreakController