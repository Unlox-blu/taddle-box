'use strict';

const TABLE = 'task';

const LIST_FIELDS = [
  'id', 'user_id', 'post_count', 'share_count',
  'streak', 'profile_completion', 'created_at',
  'updated_at',
].join(', ');

const format = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    streak: row.streak,
    postCount: row.post_count,
    shareCount: row.share_count,
    profileCompletion: row.profile_completion,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

module.exports = {
  TABLE,
  LIST_FIELDS,
  format,
};