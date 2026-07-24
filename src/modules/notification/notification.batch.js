'use strict';

const redis = require('../../config/redis');

class NotificationBatchService {
  constructor({ redisClient = redis } = {}) {
    this.redisClient = redisClient;
  }

  buildBatchKey({ recipientId, type, resourceType, resourceId }) {
    if(type === 'FOLLOW')
      return `notification:batch:${type}:${recipientId}`;

    return `notification:batch:${type}:${recipientId}:${resourceType}:${resourceId}`;
  }

  async saveBatch({ key, payload }) {
    const serialized = JSON.stringify(payload);
    await this.redisClient.set(key, serialized, 'EX', 1800);
    return key;
  }

  async getBatch(key) {
    const value = await this.redisClient.get(key);
    if (!value) return null;
    return JSON.parse(value);
  }

  async clearBatch(key) {
    await this.redisClient.del(key);
  }
}

module.exports = NotificationBatchService;
