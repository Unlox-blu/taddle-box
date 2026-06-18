'use strict';

const TABLE = 'bookmark';

const LIST_FIELDS = [
  'b.user_id',
  'b.post_id',
  'b.created_at'
].join(', ');

const format = (row) => {
  if (!row) return null;
  return {
    postId: row.post_id,
    userId: row.user_id,
    createdAt: row.created_at
  };
};

module.exports = { TABLE, LIST_FIELDS, format };
