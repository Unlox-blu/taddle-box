'use strict';

const NOTIFICATION_TABLE = 'notifications';
const NOTIFICATION_BATCH_TABLE = 'batch_notifications';
const NOTIFICATION_PROMOTIONAL_TABLE = 'promotional_notifications';

const PREFERENCE_TABLE = 'notification_preferences';

const NOTIFICATION_FIELDS = [
  'id', 'sender_id', 'type', 'title', 'message',
  'resource_type', 'resource_id', 'meta', 'is_read', 'read_at', 'created_at',
].join(', ');

const NOTIFICATION_BATCH_FIELDS = [
  'id', 'sender_id', 'type', 'title', 
  'resource_type', 'resource_id', 'is_read', 'read_at', 'created_at',
].join(', ');

const NOTIFICATION_PROMOTIONAL_FIELDS = [
  'id', 'sender_id', 'type', 'title', 
  'resource_type', 'resource_id', 'created_at',
].join(', ');

const LIST_FIELDS = [
  'id', 'sender_id', 'type', 'title', 'message',
  'resource_type', 'resource_id', 'meta', 'is_read', 'read_at', 'created_at',
].join(', ');

const NOTIFICATION_TYPES = [
  'follow',
  'like_post',
  'like_comment',
  'comment',
  'mention',
  'community_join_request',
  'community_join_approved',
  'community_post_approved',
  'event_reminder',
  'event_registration',
  'wallet_credit',
  'system',
];

const format = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    senderId: row.sender_id,
    type: row.type,
    title: row.title,
    message: row.message,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    meta: row.meta || null,
    isRead: row.is_read,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
};

module.exports = { 
  NOTIFICATION_TABLE, NOTIFICATION_BATCH_TABLE, NOTIFICATION_PROMOTIONAL_TABLE, PREFERENCE_TABLE, 
  NOTIFICATION_FIELDS, NOTIFICATION_BATCH_FIELDS, NOTIFICATION_PROMOTIONAL_FIELDS, LIST_FIELDS, 
  NOTIFICATION_TYPES, format,  };
