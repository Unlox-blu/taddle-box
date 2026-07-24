'use strict';

const redis = require('../../config/redis');

class NotificationBatchService {
  constructor({ redisClient = redis } = {}) {
    this.redisClient = redisClient;
  }

  async buildBatchKey({ recipientId, type, resourceType, resourceId }) {
    if(type === 'FOLLOW')
      return `notification:batch:${type}:${recipientId}`;

    return `notification:batch:${type}:${recipientId}:${resourceType}:${resourceId}`;
  }

  async saveBatch({ batchKey, payload }) {
    const serialized = JSON.stringify(payload);

    try {
      const result = await redis.setex(batchKey, 300, serialized);

      const value = await redis.get(batchKey);
    } catch (err) {
      console.error("Redis error:", err);
    }
  }

  async getBatch(batchKey) {
    // const value = await this.redisClient.get(batchKey);
    const value = await redis.get(batchKey);
    if (!value) return null;
    return JSON.parse(value);
  }

  async clearBatch(batchKey) {
    // await this.redisClient.del(batchKey);
    await redis.del(batchKey);
  }
}

module.exports = NotificationBatchService;
