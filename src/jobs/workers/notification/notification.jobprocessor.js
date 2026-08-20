'use strict';


const {notificationRepository} = require('../../../modules/notification/notification.container');
const { emitNotification } = require('../../../sockets/notification.socket');
const NotificationModel = require('../../../modules/notification/notification.model');
const { logger } = require('../../../middlewares/logger.middleware');
const { getPromotionalNotificationByUserId } = require('../../../modules/settings/settings.repository');
const { clientRegistryService: pushNotificationService } = require('../../../modules/pushNotification/clientRegistry.container');
const emitNotificationBatch = require('../../../modules/notification/notification.worker');
const { addJob } = require('../../../jobs/queues/job.queue');

const notificationJobProcessor = async (job) => {
      logger.info(`[NotifWorker] Processing: ${job.name}`, { id: job.id });

      switch (job.name) {
        case 'new_follower': {
          const { followingId, followerId, followerName, followerUsername } = job.data;
            const notif = await notificationRepository.createNotification({
            recipientId: followingId,
            senderId: followerId,
            type: 'follow',
            title: 'New follower',
            message: `${followerName} (@${followerUsername}) started following you`,
            resourceType: 'user',
            resourceId: followerId,
          });
          emitNotification(followingId, NotificationModel.format(notif));
          break;
        }

        case 'request_to_follow': {
          const { followingId, followerId, followerName, followerUsername } = job.data;
          // Create notification records for each follower and emit socket events
            const notif = await notificationRepository.createNotification({
            recipientId: followingId,
            senderId: followerId,
            type: 'request_to_follow',
            title: 'Request to follow',
            message: `${followerName} (@${followerUsername}) request to follow`,
            resourceType: 'user',
            resourceId: followerId,
          });
          emitNotification(followingId, NotificationModel.format(notif));
          break;
        }

        case 'approved_to_follow': {
          const { followerId, followingId, followingName, followingname } = job.data;
            const notif = await notificationRepository.createNotification({
            recipientId: followerId,
            senderId: followingId,
            type: 'approved_to_follow',
            title: 'Follow Request Approved',
            message: `${followingName} (@${followingname}) approved to follow`,
            resourceType: 'user',
            resourceId: followingId,
          });
          emitNotification(followerId, NotificationModel.format(notif));
          break;
        }

        case 'post_like': {
          const { postId, recipientId, emiterName, emiterUsername, emiterId } = job.data;
          // Create notification records for each follower and emit socket events
              const notif = await notificationRepository.createNotification({
            recipientId,
            senderId: emiterId,
            type: 'post_liked',
            title: 'Post liked',
            message: `${emiterName} (@${emiterUsername}) liked the post`,
            resourceType: 'post',
            resourceId: postId,
          });
          emitNotification(recipientId, NotificationModel.format(notif));          
          break;
        }

        case 'post_comment': {
          const { postId, recipientId, emiterName, emiterUsername, emiterId, comment } = job.data;
              const notif = await notificationRepository.createNotification({
            recipientId,
            senderId: emiterId,
            type: 'post_comment',
            title: 'Comment on post',
            message: `${emiterName} (@${emiterUsername}). ${comment}`,
            resourceType: 'post',
            resourceId: postId,
          });
          emitNotification(recipientId, NotificationModel.format(notif));          
          break;
        }

        case 'new_member_join_community': {
          const { communityId, userId, userName, userUsername, adminsId = [] } = job.data;
          for (const recipientId of adminsId) {
              const notif = await notificationRepository.createNotification({
              recipientId,
              senderId: userId,
              type: 'new_member_join_community',
              title: 'Joined community',
              message: `${userName} (@${userUsername}) join the community`,
              resourceType: 'community',
              resourceId: communityId,
            });
            emitNotification(recipientId, NotificationModel.format(notif));
          }
          break;
        }

        case 'request_to_join_community': {
          const { communityId, userId, userName, userUsername, adminsId = [] } = job.data;
          for (const recipientId of adminsId) {
              const notif = await notificationRepository.createNotification({
              recipientId,
              senderId: userId,
              type: 'request_to_join_community',
              title: 'Request to join',
              message: `${userName} (@${userUsername}) request to join the community`,
              resourceType: 'community',
              resourceId: communityId,
            });
            emitNotification(recipientId, NotificationModel.format(notif));
          }
          break;
        }

        case 'approved_to_join_community': {
          const { communityId, userId, userName, userUsername, approvalId  } = job.data;
              const notif = await notificationRepository.createNotification({
              recipientId: userId,
              senderId: approvalId,
              type: 'approved_to_join_community',
              title: 'Request Approved',
              message: `${userName} (@${userUsername}) approved to join the community`,
              resourceType: 'community',
              resourceId: communityId,
            });
            emitNotification(userId, NotificationModel.format(notif));
          break;
        }

        case 'promotional': {
          const { recipientId = [], senderId, title, message, resourceType, resourceId   } = job.data;

          const recipientIds = (await Promise.all(
            recipientId.map(async (id) => {
              const { promotionalNotification } = await getPromotionalNotificationByUserId(id);
              return promotionalNotification ? id : null;
            })
          )).filter(Boolean);

          for (const id of recipientIds) {
            const notif = await notificationRepository.createNotification({
              recipientId: id,
              senderId: senderId,
              type: 'promotional',
              title: title,
              message: title,
              resourceType: resourceType,
              resourceId: resourceId,
            });
            emitNotification(id, NotificationModel.format(notif));
          }  
          break;
        }

        case 'push': {
          const payload = job.data || {};
          logger.info(`[NotifDeliveryWorker] Processing: ${payload.type}`, { id: job.id, recipientId: payload.recipientId });
          if (!payload.recipientId) return null;
          
          // Comment-mention messages carry the exact comment id ("... | <id>")
          // — surface it in the push data so a tray tap can deep-link straight
          // to the mentioned comment on the post page.
          const commentIdMatch = String(payload.message || '').match(/\|\s*([0-9a-fA-F-]{36})$/);
          const receipts = await pushNotificationService.sendToUser({
            userId: payload.recipientId,
            title: payload.title,
            message: payload.message || "Push notification" ,
            data: {
              senderId: payload.senderId,
              type: payload.type,
              resourceId: payload.resourceId,
              resourceType: payload.resourceType,
              commentId: commentIdMatch ? commentIdMatch[1] : undefined,
            },
          });

          // Log delivery outcomes per token so push failures are
          // diagnosable without reproducing on-device.
          if (Array.isArray(receipts) && receipts.length > 0) {
            for (const r of receipts) {
              if (r.status === 'ok') {
                logger.info('[PushDelivery] success', {
                  jobId: job.id,
                  recipientId: payload.recipientId,
                  type: payload.type,
                  provider: r.pushProvider || 'expo',
                  token: r.token,
                });
              } else {
                logger.warn('[PushDelivery] failed', {
                  jobId: job.id,
                  recipientId: payload.recipientId,
                  type: payload.type,
                  provider: r.pushProvider || 'expo',
                  token: r.token,
                  status: r.status,
                  error: r.message || r.details?.error || 'unknown',
                });
              }
            }

            // Schedule receipt polling ~45 s from now to catch delayed
            // delivery failures (RateLimited, DeviceNotRegistered that the
            // ticket response didn't catch, etc.).
            const hasTicketIds = receipts.some((r) => r.ticketId);
            if (hasTicketIds) {
              await addJob('notification:receipt-poll', {
                receipts,
                recipientId: payload.recipientId,
                type: payload.type,
              }, { delay: 45000 }).catch(() => {});
            }
          } else {
            logger.warn('[PushDelivery] no tokens found for user', {
              jobId: job.id,
              recipientId: payload.recipientId,
              type: payload.type,
            });
          }

          return receipts;
        }

        case 'emit': {
          const payload = job.data || {};
          logger.info(`[EmitNotificationWorker] Processing: notification`, { id: job.id, recipientId: payload.recipientId });
          await emitNotificationBatch(payload)
          break;
        }

        case 'receipt-poll': {
          const { receipts: savedReceipts } = job.data || {};
          if (Array.isArray(savedReceipts) && savedReceipts.length > 0) {
            logger.info('[ReceiptPoll] Polling delivery receipts', { jobId: job.id, count: savedReceipts.length });
            await pushNotificationService.pollAndPruneReceipts(savedReceipts);
          }
          break;
        }

        default:
          logger.warn(`[NotifWorker] Unknown job type: ${job.name}`);
      }

      logger.info(`[NotifWorker] Done: ${job.name}`, { id: job.id });
    }

module.exports = notificationJobProcessor