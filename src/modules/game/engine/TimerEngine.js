'use strict';

/**
 * TimerEngine — manages match timers via BullMQ.
 *
 * Timer authority:
 *   - Plugin defines WHAT timers exist (via getTimers())
 *   - Executor manages the timer LIFECYCLE (start, clear, expire)
 *   - Timer durations come from config snapshots (not hard-coded)
 *
 * Crash-resilient:
 *   - BullMQ provides durable delayed jobs
 *   - Unique job IDs prevent collision with active/locked jobs
 */

const { Queue } = require('bullmq');
const redis = require('../../../config/redis');

class TimerEngine {
  constructor() {
    this.queue = new Queue('GameTimers', { connection: redis });
  }

  /**
   * Start or overwrite a timer for a specific match.
   *
   * Every timer gets a UNIQUE job ID to avoid collision with active/locked jobs.
   * BullMQ >= 5 does not allow colons in custom job IDs.
   *
   * @param {string} matchId
   * @param {string} type e.g. 'turn', 'round', 'reconnect', 'game'
   * @param {number} ms delay in milliseconds
   * @param {Object} jobData data passed to the worker
   */
  async startTimer(matchId, type, ms, jobData) {
    const jobId = `${matchId}_${type.replace(/:/g, '_')}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await this.clearTimer(matchId, type);

    await this.queue.add(type, { matchId, type, ...jobData }, {
      delay: ms,
      jobId,
      removeOnComplete: true,
      removeOnFail: true,
    });

    await redis.sadd(`match:${matchId}:timers`, jobId);
  }

  /**
   * Clear pending timers of a given type for a match.
   * Timers currently being processed (active/locked) are dropped from tracking
   * only — they self-clean on completion.
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
   * Clear all timers associated with a match.
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

  /**
   * Start timers defined by the plugin for the current match state.
   * Plugin returns the timer definitions; executor manages lifecycle.
   *
   * @param {string} matchId
   * @param {Object} pluginState current plugin state
   * @param {Object} timers array from plugin.getTimers()
   */
  async startPluginTimers(matchId, pluginState, timers) {
    for (const timer of timers) {
      await this.startTimer(matchId, timer.type, timer.durationMs, timer.jobData || {});
    }
  }
}

// Export as a singleton
module.exports = new TimerEngine();
