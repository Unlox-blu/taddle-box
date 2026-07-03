'use strict';

const BOOKMARK_TABLE = 'bookmark';
const POST_TABLE = 'posts';
const USER_TABLE = 'users';
const COMMUNITY_TABLE = 'communities';
const MEDIA_TABLE = 'media';

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

module.exports = { BOOKMARK_TABLE, POST_TABLE, USER_TABLE, COMMUNITY_TABLE, MEDIA_TABLE, LIST_FIELDS, format };
