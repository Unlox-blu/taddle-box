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
   *
   * IMPORTANT: every timer gets a UNIQUE job id. Timers are sometimes restarted
   * from inside a worker callback while the previous job of the same type is
   * still ACTIVE (locked by that worker). BullMQ refuses to remove locked jobs,
   * and re-adding a job with the SAME id while the old one is processing
   * silently destroys the new job when the old completes (removeOnComplete). A
   * unique suffix avoids the collision entirely — the old job self-cleans once
   * its processor returns, and clearTimer only removes pending (removable) jobs.
   * @param {string} matchId 
   * @param {string} type e.g., 'turn', 'round', 'reconnect'
   * @param {number} ms 
   * @param {Object} jobData 
   */
  async startTimer(matchId, type, ms, jobData) {
    // BullMQ >= 5 does not allow colons in custom job IDs
    const jobId = `${matchId}_${type.replace(/:/g, '_')}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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
   * Clear pending timers of a given type for a match. Timers currently being
   * processed (active/locked) can't be removed — they are consumed by the
   * worker and self-clean on completion, so they are only dropped from the
   * tracking set.
   * @param {string} matchId 
   * @param {string} type 
   */
  async clearTimer(matchId, type) {
    const key = `match:${matchId}:timers`;
    const prefix = `${matchId}_${type.replace(/:/g, '_')}_`;
    const jobIds = await redis.smembers(key);
    for (const jobId of jobIds) {
      if (!jobId.startsWith(prefix)) continue;
      const job = await this.queue.getJob(jobId);
      if (job) {
        await job.remove().catch(() => {});
      }
      await redis.srem(key, jobId);
    }
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
