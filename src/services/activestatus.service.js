'use strict';

const redis = require('../config/redis');
const { createError } = require('../utils/error.util');

class ActiveStatusService {
  constructor({ activeStatusRepository }) {
    this.activeStatusRepo = activeStatusRepository;
  }

  async getStatus({ userId }) {
    try {

      const cacheKey = `user:status:${userId}`;

      const cached = await redis.get(cacheKey);

      if(cached){
        return cached === 'online' ? {status: 'online', redis:true} : {lastSeen: cached, redis:true}
      }

      const status = await this.activeStatusRepo.findByUserId(userId);

      return status.is_active === 'online' ? {status: 'online'} : {lastSeen: status.last_seen};
    } catch (error) {
      throw error;
    }
  }
}

module.exports = ActiveStatusService;
