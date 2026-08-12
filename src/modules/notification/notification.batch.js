'use strict';

const redis = require('../../config/redis');

class NotificationBatchService {
  constructor({ redisClient = redis } = {}) {
    this.redisClient = redisClient;
  }

  getBatchKey({ recipientId, resourceType, resourceId, type }) {
    return `notification_batch_${type}_${recipientId}_${resourceType}_${resourceId}`;
  }

async addToBatch(data) {
  const key = this.getBatchKey(data);
  const actorsKey = `${key}:actors`;

  const exists = await this.redisClient.exists(key);

  // Ordered actor list — Redis SETs don't preserve arrival order, and the
  // stacked copy needs "first actor" (the row's sender) and "second actor"
  // (named in "A and B ..."), so the batch keeps a JSON array too.
  let actorOrder = [];
  const existing = await this.redisClient.hget(key, 'actorOrder');
  if (existing) {
    try { actorOrder = JSON.parse(existing); } catch (e) { actorOrder = []; }
  }
  if (data.senderId && !actorOrder.includes(data.senderId)) {
    actorOrder.push(data.senderId);
  }

  await this.redisClient.hset(key, {
    recipientId: data.recipientId,
    resourceType: data.resourceType,
    resourceId: data.resourceId,
    type: data.type,
    actorOrder: JSON.stringify(actorOrder),
    updatedAt: Date.now()
  });

  // Add sender to the set (duplicates are ignored) — kept for legacy workers.
  await this.redisClient.sadd(actorsKey, data.senderId);

  await this.redisClient.expire(key, 1800);
  await this.redisClient.expire(actorsKey, 1800);

  return {
    key,
    isNew: !exists
  };
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
