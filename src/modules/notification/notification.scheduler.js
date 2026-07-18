'use strict';

const redis = require('../../config/redis');

class NotificationSchedulerService {
  constructor({ redisClient = redis } = {}) {
    this.redisClient = redisClient;
  }

  async schedule({ key, runAt, payload }) {
    const score = new Date(runAt).getTime();
    await this.redisClient.zadd('notification:schedule', score, JSON.stringify({ key, payload }));
    return { key, runAt };
  }

  async getDueNotifications() {
    const now = Date.now();
    const raw = await this.redisClient.zrangebyscore('notification:schedule', 0, now);
    return raw.map((entry) => JSON.parse(entry));
  }

  async remove({ key }) {
    const entries = await this.redisClient.zrange('notification:schedule', 0, -1);
    const matches = entries.filter((entry) => {
      const parsed = JSON.parse(entry);
      return parsed.key === key;
    });

    if (matches.length) {
      await this.redisClient.zrem('notification:schedule', ...matches);
    }
  }
}

module.exports = NotificationSchedulerService;
