'use strict';

const { createError } = require("../../utils/error.util");

class TaskService {
  constructor({ taskRepository, xpService }) {
    this.taskRepo = taskRepository;
    this.xpSvc = xpService;
  }

  async getTask ({userId}) {
    try {
        const task = await this.taskRepo.findByUserId(userId)
        return task
    } catch (error) {
        throw error
    }
  }

  async createTask ({userId}) {
    try {
        const isExist = await this.taskRepo.findByUserId(userId)
        if(isExist)
          throw createError("Task acc already exist", 409)

        const task = await this.taskRepo.create(userId)
        return task
    } catch (error) {
        throw error
    }
  }

  async incrementPostCount ({userId, count = 1}) {
    try {
        const task = await this.taskRepo.incrementPostCount(userId, count)
        
        const postCount = parseInt(task.postCount, 10)

        if(postCount === 1 || postCount % 5 === 0){
          const xp = 5
          const transactionType = "bonus"
          const sourceType = "Post"
          await this.xpSvc.creditXP({ userId, xp, transactionType, sourceType })
        }

        return task
    } catch (error) {
        throw error
    }
  }

  async incrementShareCount ({userId, count = 1}) {
    try {
        const task = await this.taskRepo.incrementShareCount(userId, count)
        const shareCount = parseInt(task.shareCount, 10)

        if(shareCount % 5 === 0){
          const xp = 5
          const transactionType = "bonus"
          const sourceType = "Post share"
          await this.xpSvc.creditXP({ userId, xp, transactionType, sourceType })
        }
        return task
    } catch (error) {
        throw error
    }
  }

  async updateStreak ({userId, streak}) {
    try {
        const task = await this.taskRepo.updateStreak(userId, streak)
        const streakCount = parseInt(task.streak, 10)

        if(streakCount === 7 || streakCount % 7 === 0){
          const xp = 5
          const transactionType = "bonus"
          const sourceType = "Streak"
          await this.xpSvc.creditXP({ userId, xp, transactionType, sourceType })
        }
        return task
    } catch (error) {
        throw error
    }
  }

  async updateProfileCompletion ({userId, profileCompletion}) {
    try {
        const task = await this.taskRepo.updateProfileCompletion(userId, profileCompletion)
        const profileCompletionPercentage  = parseInt(profileCompletion, 10)

        if(profileCompletionPercentage === 60 || profileCompletionPercentage === 100){
          const xp = 5
          const transactionType = "bonus"
          const sourceType = "profile Completion"
          await this.xpSvc.creditXP({ userId, xp, transactionType, sourceType })
        }
        return task
    } catch (error) {
        throw error
    }
  }

  async updateCounts (userId,  { postCount, shareCount, streak, profileCompletion }) {
    try {
        const task = await this.taskRepo.updateCounts(userId,  { postCount, shareCount, streak, profileCompletion })
        return task
    } catch (error) {
        throw error
    }
  }


}

module.exports = TaskService