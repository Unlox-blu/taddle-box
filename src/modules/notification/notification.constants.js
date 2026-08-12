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
  GAME_INVITE: {
    save: true,
    socket: true,
    push: true,
    batch: false,
    delay: 0,
    priority: PRIORITY.HIGH,
    cooldown: 0,
    category: 'system',
  },
  POST_LIKE: {
    save: true,
    socket: false,
    push: true,
    batch: true,
    delay: 300000,
    priority: PRIORITY.LOW,
    cooldown: 300000,
    category: 'likes',
  },
  COMMENT: {
    save: true,
    socket: false,
    push: true,
    batch: true,
    delay: 5000,
    priority: PRIORITY.MEDIUM,
    cooldown: 600000,
    category: 'comments',
  },
  FOLLOW: {
    // Non-batched so follow notifications land in the notifications table and
    // the socket instantly — the batch emit worker is unreliable and the
    // follow-back action in-app needs a real notification row with senderId.
    save: true,
    socket: true,
    push: true,
    batch: false,
    delay: 0,
    priority: PRIORITY.MEDIUM,
    cooldown: 0,
    category: 'follows',
  },
  REFERRAL_REWARD: {
    save: true,
    socket: true,
    push: true,
    batch: false,
    delay: 0,
    priority: PRIORITY.HIGH,
    cooldown: 0,
    category: 'rewards',
  },
  MENTION: {
    save: true,
    socket: false,
    push: true,
    batch: false,
    delay: 0,
    priority: PRIORITY.HIGH,
    category: 'mentions',
  },
  REPLY: {
    save: true,
    socket: false,
    push: true,
    batch: true,
    delay: 5000,
    priority: PRIORITY.HIGH,
    cooldown: 600000,
    category: 'replies',
  },
  PROMOTION: {
    save: true,
    socket: false,
    push: true,
    batch: false,
    delay: 1800000,
    priority: PRIORITY.VERY_LOW,
    category: 'marketing',
  },
  REQUEST_TO_FOLLOW: {
    save: true,
    socket: true,
    push: true,
    batch: false,
    delay: 0,
    priority: PRIORITY.MEDIUM,
  },
  REQUEST_TO_JOIN_COMMUNITY: {
    // Batched per community so multiple join requests stack like Instagram
    // ("A and B requested to join your community") instead of spamming one
    // row per requester.
    save: true,
    socket: true,
    push: true,
    batch: true,
    delay: 5000,
    priority: PRIORITY.MEDIUM,
    cooldown: 600000,
    category: 'communities',
  },
  // Fan-out when a followed user publishes a post or repost (Twitter-style).
  NEW_POST: {
    save: true,
    socket: false,
    push: true,
    batch: false,
    delay: 0,
    priority: PRIORITY.LOW,
    category: 'social',
  },
  // Streak is about to break / a 24-hour restore window is open — urgent
  // enough to push immediately so the user comes back to save the streak.
  STREAK_AT_RISK: {
    save: true,
    socket: true,
    push: true,
    batch: false,
    delay: 0,
    priority: PRIORITY.HIGH,
    category: 'system',
  },
  // Milestone reward earned (every 7th day) — celebratory.
  STREAK_REWARD: {
    save: true,
    socket: true,
    push: true,
    batch: false,
    delay: 0,
    priority: PRIORITY.MEDIUM,
    category: 'rewards',
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
  NEW_POST: 'NEW_POST',
  REPOST: 'NEW_POST',
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
      save: baseDefinition.save !== false,
      socket: baseDefinition.socket !== false,
      push: baseDefinition.push !== false,
      batch: Boolean(baseDefinition.batch),
      delay: Number(baseDefinition.delay || 0),
      priority: baseDefinition.priority || PRIORITY.MEDIUM,
      cooldown: Number(baseDefinition.cooldown || 0),
      category: baseDefinition.category || 'general',
      type,
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
