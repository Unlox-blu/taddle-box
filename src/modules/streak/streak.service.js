'use strict';

const { createError } = require('../../utils/error.util');

class StreakService {
  constructor({ streakRepository, taskService, xpService }) {
    this.streakRepo = streakRepository;
    this.taskSvc = taskService;
    this.xpSvc = xpService;
  }

  async createOrUpdate (userId) {
    try {
        const previousStreak = await this.streakRepo.findOneByUserId(userId)
        
        if(!previousStreak ){
            const streak = await this.streakRepo.create(userId)
            await this.taskSvc.updateStreak({userId, streak: 1})
            return { streak, weeklyBonusEarned: false }
        }

        const currentDate = new Date();
        const previousDate = new Date(previousStreak.endDate);
        
        let newStreak = previousStreak;
        let weeklyBonusEarned = false;

        if(this.#isSameday(currentDate, previousDate)){
            throw createError("Streak is already updated", 400)
        }else if(this.#isYesterday(currentDate, previousDate)){
            newStreak = await this.streakRepo.updateById(previousStreak.id)
            const count = parseInt(newStreak.streakCount, 10)
            if (count > 0 && count % 7 === 0) {
                // Grant weekly bonus
                await this.xpSvc.creditXP({
                    userId,
                    xp: 150,
                    transactionType: 'bonus',
                    sourceType: 'Weekly Streak'
                }).catch(e => console.error("Failed to grant weekly streak XP", e));
                weeklyBonusEarned = true;
            }
        }else{
            newStreak = await this.streakRepo.create(userId)
        }

        await this.taskSvc.updateStreak({userId, streak: 1})
        return { streak: newStreak, weeklyBonusEarned }
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
        const { streaks, total } = await this.streakRepo.findManyByUserId(userId, limit, offset)
        return { streaks, total }
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