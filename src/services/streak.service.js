'use strict';

const { createError } = require('../utils/error.util');
const UserModel = require('../models/user.model');
const FollowersModel = require('../models/followers.model');
const { uploadFile } = require('../integrations/storage/cloudinary.service');
const { tryCatch } = require('bullmq');
const { startNotificationWorker } = require('../jobs/workers/notification.worker');
const { addNotificationJob } = require('../jobs/queues/notification.queue');

class StreakService {
  constructor({ streakRepository }) {
    this.streakRepo = streakRepository;
  }

  async createOrUpdate (userId) {
    try {
        const previousStreak = await this.streakRepo.findOneByUserId(userId)
        
        if(!previousStreak ){
            return await this.streakRepo.create(userId)
        }

        const currentDate = new Date();
        const previousDate = new Date(previousStreak.end_date);

        if(this.#isSameday(currentDate, previousDate)){
            throw createError("Streak is already updated", 400)
        }

        if(this.#isYesterday(currentDate, previousDate)){
            return await this.streakRepo.updateById(previousStreak.id)
        }

        return await this.streakRepo.create(userId)
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