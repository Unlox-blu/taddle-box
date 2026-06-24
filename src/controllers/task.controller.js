'use strict';

const { apiResponse } = require('../utils/response.util');
const { getPaginationParams, paginationMeta } = require('../utils/pagination.util');

class TaskController {
  constructor({ taskService }) {
    this.taskSvc = taskService;
  }
  
  getTask = async (req, res, next) => {
    try {
        const userId = req.userId
        const streak = await this.taskSvc.getTask(userId)
        res.json(apiResponse(streak, 'Streak fetched successfully'));
    } catch (error) {
        next(error)
    }
  }
}


module.exports = TaskController