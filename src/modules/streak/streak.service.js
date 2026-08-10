'use strict';

const { createError } = require('../../utils/error.util');
const { addJob } = require('../../jobs/queues/job.queue');
const { notificationService } = require('../notification/notification.container');

// Streaks run in continuous 7-day cycles: Day 1-7, then Day 8-14, and so on.
// The cycle is anchored to the streak's own start day, never to calendar
// day-of-week — the milestone reward fires on every 7th consecutive day.
const CYCLE = 7;
// Restore window: the full day after the missed day (24 hours). If the user
// does not restore before the deadline the streak resets completely.
const RESTORE_WINDOW_DAYS = 3; // end_date + 3 days at 00:00 (see #restoreDeadlineFor)

// Milestone reward: 100 XP at Day 7, +100 XP per cycle, capped at 5000.
// Day 7 → 100, Day 14 → 200, Day 21 → 300, ... Day 350 → 5000 (cap).
const rewardXpFor = (count) => {
  if (count % CYCLE !== 0) return 0;
  return Math.min(100 * (count / CYCLE), 5000);
};

// The next milestone day STRICTLY AFTER the current count (7, 14, 21, ...).
// At an exact milestone (e.g. Day 7) the reward is already earned, so the
// next one is Day 14. No streak (0) points at Day 7.
const nextMilestoneDay = (count) => {
  if (count <= 0) return CYCLE;
  return count % CYCLE === 0 ? count + CYCLE : Math.ceil(count / CYCLE) * CYCLE;
};

// Restore cost: 70% of the NEXT milestone reward (min 50 XP). Restoring is
// always worth it — finishing the next milestone pays back more XP than the
// cost, and the streak itself keeps growing. Examples: 5-day → 70 XP,
// 14-day → 140 XP, 500-day → 5040 XP.
const restoreCostFor = (count) =>
  Math.max(50, Math.ceil(rewardXpFor(nextMilestoneDay(count)) * 0.7));

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const daysBetween = (a, b) =>
  Math.round((startOfDay(b) - startOfDay(a)) / 86400000);

class StreakService {
  constructor({ streakRepository, taskService, xpService }) {
    this.streakRepo = streakRepository;
    this.taskSvc = taskService;
    this.xpSvc = xpService;
  }

  // Shared response shape — the client renders ticks/rewards/restore from
  // these fields only, so the formulas live in one place (here).
  #buildResponse({ streak, restorable }) {
    const count = streak ? parseInt(streak.streakCount, 10) : 0;
    const nextDay = nextMilestoneDay(count);
    return {
      streak,
      restorable: Boolean(restorable),
      restoreCost: restorable ? restoreCostFor(count) : 0,
      restoreDeadline: streak?.restoreDeadline || null,
      nextMilestoneDay: nextDay,
      nextRewardXp: rewardXpFor(nextDay),
    };
  }

  // Restore deadline: the streak breaks the day after end_date (missed day),
  // and the user gets the FULL following day — a 24-hour window — to revive
  // it. So the deadline is (end_date + 3 days) at 00:00.
  #restoreDeadlineFor(endDate) {
    const deadline = new Date(endDate);
    deadline.setDate(deadline.getDate() + RESTORE_WINDOW_DAYS);
    deadline.setHours(0, 0, 0, 0);
    return deadline;
  }

  // Evaluate the current streak row and advance the state machine:
  //   - restore window expired → reset completely (fresh row, Day 1)
  //   - first miss detected (gap >= 2 days) → freeze + open restore window
  //   - otherwise → return the row as-is
  // `reset: true` means a brand-new row was created (the old streak is gone).
  async #evaluate(userId, { notify = true } = {}) {
    const streak = await this.streakRepo.findOneByUserId(userId);
    if (!streak) return null;

    const now = new Date();
    const count = parseInt(streak.streakCount, 10);
    const gap = daysBetween(new Date(streak.endDate), now);

    const reset = async () => {
      const fresh = await this.streakRepo.create(userId);
      await this.taskSvc.updateStreak({ userId, streak: 1 });
      return { streak: fresh, restorable: false, reset: true };
    };

    // Window already expired (or was never frozen and the deadline has
    // passed) → the streak is gone, start over.
    if (streak.restoreDeadline && now >= new Date(streak.restoreDeadline)) {
      return reset();
    }
    if (gap >= 2 && !streak.restoreDeadline) {
      const deadline = this.#restoreDeadlineFor(new Date(streak.endDate));
      if (now >= deadline) return reset();
      const frozen = await this.streakRepo.freeze(streak.id, deadline);
      if (notify) this.#notifyAtRisk(userId, count);
      return { streak: frozen, restorable: true, reset: false };
    }

    return { streak, restorable: Boolean(streak.restoreDeadline), reset: false };
  }

  async createOrUpdate(userId) {
    try {
      const evaluated = await this.#evaluate(userId, { notify: true });

      // Brand-new user (no row has ever existed) → Day 1.
      if (!evaluated) {
        const streak = await this.streakRepo.create(userId);
        await this.taskSvc.updateStreak({ userId, streak: 1 });
        return { ...this.#buildResponse({ streak, restorable: false }), rewardEarned: false, rewardXp: 0 };
      }

      // Reset just happened (or an open restore window exists) → nothing to
      // increment; report the current state.
      if (evaluated.reset || evaluated.restorable) {
        return { ...this.#buildResponse(evaluated), rewardEarned: false, rewardXp: 0 };
      }

      const now = new Date();
      const gap = daysBetween(new Date(evaluated.streak.endDate), now);
      if (gap === 0) throw createError("Streak is already updated", 400);

      // Normal continuation → count + 1.
      const updated = await this.streakRepo.updateById(evaluated.streak.id);
      const newCount = parseInt(updated.streakCount, 10);

      // Milestone reward every 7th day — dynamic XP, granted once per row.
      let rewardEarned = false;
      let rewardXp = 0;
      if (newCount % CYCLE === 0 && (updated.lastRewardedDay || 0) < newCount) {
        rewardXp = rewardXpFor(newCount);
        rewardEarned = rewardXp > 0;
        if (rewardEarned) {
          await this.streakRepo.markRewarded(evaluated.streak.id, newCount);
          this.xpSvc.creditXP({
            userId,
            xp: rewardXp,
            transactionType: 'bonus',
            sourceType: `Streak Reward - Day ${newCount}`,
          }).catch(e => console.error('Failed to grant streak reward XP:', e));
          this.#notifyReward(userId, newCount, rewardXp);
        }
      }

      await this.taskSvc.updateStreak({ userId, streak: newCount });

      // Proactively remind them tomorrow morning if they haven't logged in.
      this.#scheduleAtRiskReminder(userId, updated);

      return {
        ...this.#buildResponse({ streak: updated, restorable: false }),
        rewardEarned,
        rewardXp,
      };
    } catch (error) {
      throw error;
    }
  }

  async getCurrentStreak(userId) {
    try {
      const evaluated = await this.#evaluate(userId, { notify: true });
      return evaluated
        ? this.#buildResponse(evaluated)
        : this.#buildResponse({ streak: null, restorable: false });
    } catch (error) {
      throw error;
    }
  }

  // Revive a frozen streak by paying XP. The count is preserved and the
  // streak continues from today; the restore window closes.
  async restoreStreak(userId) {
    try {
      const evaluated = await this.#evaluate(userId, { notify: false });
      if (!evaluated || !evaluated.restorable) {
        throw createError('No active restore window — your streak has already reset', 400);
      }

      const count = parseInt(evaluated.streak.streakCount, 10);
      const cost = restoreCostFor(count);

      // Throws 400 with 'Insufficient XP balance' when the user can't pay.
      await this.xpSvc.debitXP({
        userId,
        xp: cost,
        transactionType: 'spent',
        sourceType: `Streak Restore - Day ${count}`,
      });

      const restored = await this.streakRepo.restore(evaluated.streak.id);
      await this.taskSvc.updateStreak({ userId, streak: count });

      return { ...this.#buildResponse({ streak: restored, restorable: false }), costPaid: cost };
    } catch (error) {
      throw error;
    }
  }

  async getStreakHistory({ userId, limit, offset }) {
    try {
      const { streaks, total } = await this.streakRepo.findManyByUserId(userId, limit, offset);
      return { streaks, total };
    } catch (error) {
      throw error;
    }
  }

  // "Log in today to keep your streak" — fires at the start of the day after
  // the last activity, but only if the user hasn't logged in since.
  #scheduleAtRiskReminder(userId, streak) {
    try {
      const endDate = new Date(streak.endDate);
      const fireAt = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate() + 1, 0, 0, 0, 0);
      const delay = Math.max(60_000, fireAt.getTime() - Date.now());
      addJob('streak:reminder', { userId, lastEndDate: streak.endDate }, { delay });
    } catch (error) {
      console.error('Failed to schedule streak reminder:', error);
    }
  }

  // Freeze moment: a 24-hour restore window just opened.
  async #notifyAtRisk(userId, count) {
    try {
      await notificationService.publishNotification({
        type: 'STREAK_AT_RISK',
        recipientId: userId,
        senderId: userId,
        resourceType: 'streak',
        title: 'Restore your streak! 🔥',
        message: `You missed a day. Restore your ${count}-day streak within the next 24 hours!`,
      });
    } catch (error) {
      console.error('Failed to send streak at-risk notification:', error);
    }
  }

  async #notifyReward(userId, count, xp) {
    try {
      await notificationService.publishNotification({
        type: 'STREAK_REWARD',
        recipientId: userId,
        senderId: userId,
        resourceType: 'streak',
        title: `${count}-Day Streak Complete! 🎉`,
        message: `You earned ${xp} XP for reaching Day ${count}. Keep the streak going!`,
      });
    } catch (error) {
      console.error('Failed to send streak reward notification:', error);
    }
  }
}

module.exports = StreakService