'use strict';

const { notificationService } = require('./notification.container');

const publishLikeExample = async (payload) => {
  return notificationService.publishNotification({
    type: 'POST_LIKE',
    recipientId: payload.recipientId,
    actorId: payload.actorId,
    entityId: payload.entityId,
    entityType: 'post',
    title: 'Post liked',
    message: 'Someone liked your post',
  });
};

const publishFollowExample = async (payload) => {
  return notificationService.publishNotification({
    type: 'FOLLOW',
    recipientId: payload.recipientId,
    actorId: payload.actorId,
    entityId: payload.entityId,
    entityType: 'user',
    title: 'New follower',
    message: 'You have a new follower',
  });
};

const publishCommentExample = async (payload) => {
  return notificationService.publishNotification({
    type: 'COMMENT',
    recipientId: payload.recipientId,
    actorId: payload.actorId,
    entityId: payload.entityId,
    entityType: 'post',
    title: 'New comment',
    message: 'Someone commented on your post',
  });
};

const publishMentionExample = async (payload) => {
  return notificationService.publishNotification({
    type: 'MENTION',
    recipientId: payload.recipientId,
    actorId: payload.actorId,
    entityId: payload.entityId,
    entityType: 'comment',
    title: 'You were mentioned',
    message: 'You were mentioned in a conversation',
  });
};

const publishReplyExample = async (payload) => {
  return notificationService.publishNotification({
    type: 'REPLY',
    recipientId: payload.recipientId,
    actorId: payload.actorId,
    entityId: payload.entityId,
    entityType: 'comment',
    title: 'New reply',
    message: 'Someone replied to your comment',
  });
};

const publishPromotionExample = async (payload) => {
  return notificationService.publishNotification({
    type: 'PROMOTION',
    recipientId: payload.recipientId,
    actorId: payload.actorId,
    entityId: payload.entityId,
    entityType: 'campaign',
    title: 'Special offer',
    message: 'Check out the latest promotion',
  });
};

module.exports = {
  publishLikeExample,
  publishFollowExample,
  publishCommentExample,
  publishMentionExample,
  publishReplyExample,
  publishPromotionExample,
};
