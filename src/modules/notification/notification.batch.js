'use strict';

const redis = require('../../config/redis');

class NotificationBatchService {
  constructor({ redisClient = redis } = {}) {
    this.redisClient = redisClient;
  }

  async getBatchKey({ recipientId, entityType, entityId, type }) {
    return `notification:batch:${type}:${recipientId}:${entityType}:${entityId}`;
  }

  async addToBatch({ recipientId, entityType, entityId, type, payload }) {
    const key = await this.getBatchKey({ recipientId, entityType, entityId, type });
    const serialized = JSON.stringify(payload);
    await this.redisClient.set(key, serialized, 'EX', 1800);
    return key;
  }

  async getBatch({ recipientId, entityType, entityId, type }) {
    const key = await this.getBatchKey({ recipientId, entityType, entityId, type });
    const value = await this.redisClient.get(key);
    if (!value) return null;
    return JSON.parse(value);
  }

  async clearBatch({ recipientId, entityType, entityId, type }) {
    const key = await this.getBatchKey({ recipientId, entityType, entityId, type });
    await this.redisClient.del(key);
  }
}

module.exports = NotificationBatchService;
