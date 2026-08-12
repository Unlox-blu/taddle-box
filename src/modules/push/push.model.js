'use strict';

const TABLE = 'device_notification';

const LIST_FIELDS = [
    'id', 'user_id', 'token', 'notifications_enabled',
    'platform', 'created_at', 'updated_at'
].join(", ");

const format = (row) => ({
  id: row.id,
  userId: row.user_id,
  token: row.token,
  notificationsEnabled: row.notifications_enabled,
  platform: row.platform,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

module.exports = { TABLE, LIST_FIELDS, format };
