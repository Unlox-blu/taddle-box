'use strict';

const { createError } = require('../../utils/error.util');

class StreakService {
  constructor({ streakRepository, taskService }) {
    this.streakRepo = streakRepository;
    this.taskSvc = taskService;
  }

  async createOrUpdate (userId) {
    try {
        const previousStreak = await this.streakRepo.findOneByUserId(userId)
        
        if(!previousStreak ){
            await this.streakRepo.create(userId)
            await this.taskSvc.updateStreak(userId, 1)
            return 
        }

        const currentDate = new Date();
        const previousDate = new Date(previousStreak.end_date);

        if(this.#isSameday(currentDate, previousDate)){
            throw createError("Streak is already updated", 400)
        }

        if(this.#isYesterday(currentDate, previousDate)){
            const streak = await this.streakRepo.updateById(previousStreak.id)
            const count = parent(streak.streak_count, 10)
            this.taskSvc.updateStreak(userId, count)
            return
        }

        await this.streakRepo.create(userId)
        await this.taskSvc.updateStreak(userId, 1)
        return
    } catch (error) {
        throw error
    }
  }

  async getCurrentStreak (userId) {
    try {
        const streak = await this.streakRepo.findOneByUserId(userId)
        return streak
    } catch (error) {
        throw error
    }
  }

  async getStreakHistory ({userId, limit, offset}) {
    try {
        const streak = await this.streakRepo.findManyByUserId(userId, limit, offset)
        return streak
    } catch (error) {
        throw error
    }
  }

  #isYesterday = (currentDate, previousDate) => {
    const yesterday = new Date(currentDate);
    yesterday.setDate(yesterday.getDate() - 1);
    return (
        yesterday.getFullYear() === previousDate.getFullYear() &&
        yesterday.getMonth() === previousDate.getMonth() &&
        yesterday.getDate() === previousDate.getDate()
    );
  };

  #isSameday = (currentDate, previousDate) => {
    return (
        currentDate.getFullYear() === previousDate.getFullYear() &&
        currentDate.getMonth() === previousDate.getMonth() &&
        currentDate.getDate() === previousDate.getDate()
    );
  };
}

module.exports = StreakService