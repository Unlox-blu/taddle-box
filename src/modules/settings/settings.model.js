'use strict';

const TABLE = 'settings';

const LIST_FIELDS = [
  'user_id',
  'theme',
  'promotional_notification',
  'system_notification',
  'notif_xp',
  'notif_withdraw',
  'notif_promos',
  'public_account',
  'activity_status',
  'allow_tagging',
  'allow_reposts',
  'show_on_leaderboard',
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
    notifXP: row.notif_xp,
    notifWithdraw: row.notif_withdraw,
    notifPromos: row.notif_promos,
    publicAccount: row.public_account,
    activityStatus: row.activity_status,
    allowTagging: row.allow_tagging,
    allowReposts: row.allow_reposts,
    showOnLeaderboard: row.show_on_leaderboard,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

module.exports = { TABLE, LIST_FIELDS, format };
