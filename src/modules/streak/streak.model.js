'use strict';

const TABLE = 'streak';

const LIST_FIELDS = [
  'id',
  'user_id',
  'streak_count',
  'start_date',
  'end_date',
  'restore_deadline',
  'last_rewarded_day',
  'created_at',
  'updated_at'
].join(', ');

const format = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    streakCount: row.streak_count,
    startDate: row.start_date,
    endDate: row.end_date,
    restoreDeadline: row.restore_deadline,
    lastRewardedDay: row.last_rewarded_day,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

module.exports = { TABLE, LIST_FIELDS, format };
