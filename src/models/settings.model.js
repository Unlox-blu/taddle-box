'use strict';

const TABLE = 'settings';

const LIST_FIELDS = [
  'user_id',
  'theme',
  'promotional_notification',
  'system_notification',
  'app_lock',
  'created_at',
  'updated_at'
].join(', ');

const format = (row) => {
  if (!row) return null;
  return {
    userId: row.user_id,
    theme: row.theme,
    promotionalNotification: row.promotional_notification,
    systemNotification: row.system_notification,
    appLock: row.app_lock,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

module.exports = { TABLE, LIST_FIELDS, format };
