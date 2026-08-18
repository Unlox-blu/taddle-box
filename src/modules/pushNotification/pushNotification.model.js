'use strict';

const TABLE = 'device_notification';

const LIST_FIELDS = [
    'id', 'user_id', 'device_id', 'push_token', 'push_provider',
    'platform', 'is_active', 'notifications_enabled', 'created_at', 'updated_at'
].join(', ');

const format = (row) => ({
  id: row.id,
  userId: row.user_id,
  deviceId: row.device_id,
  pushToken: row.push_token,
  pushProvider: row.push_provider,
  platform: row.platform,
  isActive: row.is_active,
  notificationsEnabled: row.notifications_enabled,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

module.exports = { TABLE, LIST_FIELDS, format };
