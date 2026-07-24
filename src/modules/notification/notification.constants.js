'use strict';

const QUEUES = {
  NOTIFICATION: 'notification',
  NOTIFICATION_DELIVERY: 'notification-delivery',
};

const PRIORITY = {
  CRITICAL: 'CRITICAL',
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
  VERY_LOW: 'VERY_LOW',
};

const DEFAULT_NOTIFICATION_DEFINITIONS = {
  POST_LIKE: {
    save: true,
    socket: true,
    push: true,
    batch: true,
    delay: 120000,
    priority: PRIORITY.LOW,
    cooldown: 300000,
    category: 'likes',
    title: 'like your post'
  },
  COMMENT: {
    save: true,
    socket: true,
    push: true,
    batch: true,
    delay: 120000,
    priority: PRIORITY.MEDIUM,
    cooldown: 300000,
    category: 'comments',
    title: 'comment on post'
  },
  FOLLOW: {
    save: true,
    socket: true,
    push: true,
    batch: true,
    delay: 120000,
    priority: PRIORITY.MEDIUM,
    cooldown: 1200000,
    category: 'follows',
    title: 'start following you'
  },
  MENTION: {
    save: true,
    socket: true,
    push: true,
    batch: false,
    delay: 120000,
    priority: PRIORITY.HIGH,
    category: 'mentions',
    title: 'mentioned you'
  },
  REPLY: {
    save: true,
    socket: true,
    push: true,
    batch: false,
    delay: 120000,
    priority: PRIORITY.HIGH,
    category: 'replies',
    title: 'replied you'
  },
  PROMOTION: {
    save: true,
    socket: false,
    push: true,
    batch: true,
    delay: 120000,
    priority: PRIORITY.VERY_LOW,
    category: 'marketing',
    title: 'promotion'
  },
  REQUEST_TO_FOLLOW: {
    save: true,
    socket: true,
    push: true,
    batch: false,
    delay: 120000,
    priority: PRIORITY.MEDIUM,
    title: 'request to follow'
  },
  REQUEST_TO_JOIN_COMMUNITY: {
    save: true,
    socket: true,
    push: true,
    batch: false,
    delay: 120000,
    priority: PRIORITY.MEDIUM,
    title: 'request to join community'
  },
};

const TYPE_ALIASES = {
  POST_LIKE: 'POST_LIKE',
  POST_COMMENT: 'COMMENT',
  COMMENT: 'COMMENT',
  FOLLOW: 'FOLLOW',
  MENTION: 'MENTION',
  REPLY: 'REPLY',
  PROMOTION: 'PROMOTION',
  REQUEST_TO_FOLLOW: 'REQUEST_TO_FOLLOW',
  REQUEST_TO_JOIN_COMMUNITY: 'REQUEST_TO_JOIN_COMMUNITY',
};

const normalizeType = (type) => {
  if (!type) return 'COMMENT';
  const normalized = String(type).trim().toUpperCase();
  return TYPE_ALIASES[normalized] || normalized;
};

const resolveNotificationPolicy = (event = {}) => {
    const type = normalizeType(event.type);
    const baseDefinition = DEFAULT_NOTIFICATION_DEFINITIONS[type] || DEFAULT_NOTIFICATION_DEFINITIONS.COMMENT;

    return {
      save: baseDefinition.save,
      socket: baseDefinition.socket,
      push: baseDefinition.push,
      batch: baseDefinition.batch,
      delay: Number(baseDefinition.delay || 0),
      priority: baseDefinition.priority || PRIORITY.MEDIUM,
      cooldown: Number(baseDefinition.cooldown || 0),
      category: baseDefinition.category || 'general',
      type,
      title: baseDefinition.title,
    };
  };



module.exports = {
  QUEUES,
  PRIORITY,
  DEFAULT_NOTIFICATION_DEFINITIONS,
  TYPE_ALIASES,
  normalizeType,
  resolveNotificationPolicy
};
