'use strict';

const redis = require('../../config/redis');

class NotificationRedisService {
  constructor({ redisClient = redis } = {}) {
    this.redisClient = redisClient;
  }

  async isUserOnline(userId) {
    return Boolean(await this.redisClient.get(`notification:online:${userId}`));
  }

  async setUserOnline(userId, ttlSeconds = 300) {
    await this.redisClient.set(`notification:online:${userId}`, '1', 'EX', ttlSeconds);
    return true;
  }

  async setUserOffline(userId) {
    await this.redisClient.del(`notification:online:${userId}`);
    return true;
  }

  async hasCooldown({ userId, type, entityId }) {
    const key = `push:${userId}:${type}:${entityId}`;
    return Boolean(await this.redisClient.get(key));
  }

  async setCooldown({ userId, type, entityId, ttl }) {
    const key = `push:${userId}:${type}:${entityId}`;
    await this.redisClient.set(key, '1', 'EX', ttl);
  }
}

module.exports = NotificationRedisService;
