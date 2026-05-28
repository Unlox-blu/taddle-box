'use strict';

const { Worker } = require('bullmq');
const redis = require('../../config/redis');
const notificationRepository = require('../../repositories/notification.repository');
const { emitNotification } = require('../../sockets/notification.socket');
const NotificationModel = require('../../models/notification.model');
const { logger } = require('../../middlewares/logger.middleware');

const startNotificationWorker = () => {
  const worker = new Worker(
    'notification',
    async (job) => {
      logger.info(`[NotifWorker] Processing: ${job.name}`, { id: job.id });

      switch (job.name) {
        case 'new_follower': {
          // data: { followedUserId, followerId, followerName, followerUsername, followerAvatar }
          const { followedUserId, followerId, followerName, followerUsername } = job.data;
          const notif = await notificationRepository.create({
            recipientId: followedUserId,
            senderId: followerId,
            type: 'follow',
            title: 'New follower',
            message: `${followerName} (@${followerUsername}) started following you`,
            resourceType: 'user',
            resourceId: followerId,
          });
          emitNotification(followedUserId, NotificationModel.format(notif));
          break;
        }

        case 'new_post_fanout': {
          // data: { postId, authorId, authorName, authorUsername, followerIds }
          const { postId, authorId, authorName, authorUsername, followerIds = [] } = job.data;
          // Create notification records for each follower and emit socket events
          for (const recipientId of followerIds) {
            const notif = await notificationRepository.create({
              recipientId,
              senderId: authorId,
              type: 'new_post_in_feed',
              title: 'New post',
              message: `${authorName} (@${authorUsername}) published a new post`,
              resourceType: 'post',
              resourceId: postId,
            });
            emitNotification(recipientId, NotificationModel.format(notif));
          }
          break;
        }

        default:
          logger.warn(`[NotifWorker] Unknown job type: ${job.name}`);
      }

      logger.info(`[NotifWorker] Done: ${job.name}`, { id: job.id });
    },
    { connection: redis, concurrency: 10 }
  );

  worker.on('failed', (job, err) => {
    logger.error(`[NotifWorker] Failed: ${job?.name}`, { id: job?.id, error: err.message });
  });

  return worker;
};

module.exports = { startNotificationWorker };
