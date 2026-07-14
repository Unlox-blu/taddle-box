'use strict';

const redis = require('../../config/redis');
const { createError } = require('../../utils/error.util');

class GameService {
  constructor({ gameRepository }) {
    this.gameRepo = gameRepository;
  }

  async getStatus({ userId }) {
    try {

      const cacheKey = `user:status:${userId}`;

      const cached = await redis.get(cacheKey);

      if(cached){
        return cached === 'online' ? {status: 'online', redis:true} : {lastSeen: cached, redis:true}
      }

      const status = await this.activeStatusRepo.findByUserId(userId);
      if(!status)
        throw createError("status not found", 404)
      
      return status.isActive === 'online' ? {status: 'online'} : {lastSeen: status.lastSeen};
    } catch (error) {
      throw error;
    }
  }

  async createStatus({ userId }) {
    try {
      const status = await this.activeStatusRepo.findByUserId(userId);
      if(status)
        throw createError("Status is already exits", 409)
      
      await this.activeStatusRepo.create(userId);
    } catch (error) {
      throw error;
    }
  }

  async setOnline({ userId }) {
    try {
      await this.activeStatusRepo.setOnline(userId);
    } catch (error) {
      throw error;
    }
  }

  async setOffline({ userId }) {
    try {
      await this.activeStatusRepo.setOffline(userId);
    } catch (error) {
      throw error;
    }
  }

  async hardDelete({ userId }) {
    try {
      await this.activeStatusRepo.hardDelete(userId);
    } catch (error) {
      throw error;
    }
  }
}

module.exports = GameService;
