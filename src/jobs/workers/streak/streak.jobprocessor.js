'use strict';

// "Log in today to keep your streak" reminder. Scheduled at the start of the
// day after a streak day is logged; only fires if the user hasn't logged in
// since (the streak's end_date still matches the day the job was scheduled
// for), so someone who came back today never gets pinged.
module.exports = async (job) => {
  const { userId, lastEndDate } = job.data || {};
  if (!userId || !lastEndDate) return;

  const streakRepo = require('../../modules/streak/streak.repository');
  const streak = await streakRepo.findOneByUserId(userId);
  if (!streak) return;

  const end = new Date(streak.endDate);
  const last = new Date(lastEndDate);
  const advanced =
    end.getFullYear() === last.getFullYear() &&
    end.getMonth() === last.getMonth() &&
    end.getDate() === last.getDate();
  if (!advanced) return; // they logged in again — streak is safe

  const { notificationService } = require('../../modules/notification/notification.container');
  await notificationService.publishNotification({
    type: 'STREAK_AT_RISK',
    recipientId: userId,
    senderId: userId,
    resourceType: 'streak',
    resourceId: streak.id,
    title: 'Your streak is at risk! 🔥',
    message: `You have a ${streak.streak_count}-day streak going. Log in today to keep it alive!`,
  });
};
