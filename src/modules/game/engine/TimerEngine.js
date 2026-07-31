'use strict';

const { Queue } = require('bullmq');
const redis = require('../../../config/redis');

/**
 * Timer Engine for managing generic timeouts (turn, round, reconnect, game).
 * Powered by BullMQ for distributed crash-resilient delays.
 */
class TimerEngine {
  constructor() {
    this.queue = new Queue('GameTimers', { connection: redis });
  }

  /**
   * Start or overwrite a timer for a specific match.
   * @param {string} matchId 
   * @param {string} type e.g., 'turn', 'round', 'reconnect'
   * @param {number} ms 
   * @param {Object} jobData 
   */
  async startTimer(matchId, type, ms, jobData) {
    // BullMQ >= 5 does not allow colons in custom job IDs
    const jobId = `${matchId}_${type.replace(/:/g, '_')}`;
    await this.clearTimer(matchId, type);
    
    await this.queue.add(type, { matchId, type, ...jobData }, { 
      delay: ms, 
      jobId, 
      removeOnComplete: true,
      removeOnFail: true 
    });
    
    await redis.sadd(`match:${matchId}:timers`, jobId);
  }

  /**
   * Clear a specific timer for a match.
   * @param {string} matchId 
   * @param {string} type 
   */
  async clearTimer(matchId, type) {
    const jobId = `${matchId}_${type.replace(/:/g, '_')}`;
    const job = await this.queue.getJob(jobId);
    if (job) {
      await job.remove().catch(() => {});
    }
    await redis.srem(`match:${matchId}:timers`, jobId);
  }

  /**
   * Clear all timers associated with a match (useful for GAME_OVER or archiving).
   * @param {string} matchId 
   */
  async clearAllTimers(matchId) {
    const key = `match:${matchId}:timers`;
    const jobIds = await redis.smembers(key);
    for (const jobId of jobIds) {
      const job = await this.queue.getJob(jobId);
      if (job) {
        await job.remove().catch(() => {});
      }
    }
    await redis.del(key);
  }
}

// Export as a singleton
module.exports = new TimerEngine();
