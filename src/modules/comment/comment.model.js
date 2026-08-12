'use strict';

const TABLE = 'comments';
const LIKES_TABLE = 'comment_likes';

const LIST_FIELDS = [
  'c.id', 'c.post_id', 'c.parent_id', 'c.content', 'c.depth',
  'c.path', 'c.likes_count', 'c.status', 'c.created_at', 'c.updated_at',
  'u.id AS author_id', 'u.name AS author_name',
  'u.username AS author_username', 'ua.cloudfront_url AS author_avatar',

].join(', ');

const sanitize = (row) => {
  if (!row) return null;
  const { deleted_at, ...safe } = row;
  return safe;
};

const format = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    postId: row.post_id,
    parentId: row.parent_id || null,
    content: row.content,
    depth: row.depth,
    path: row.path || [],
    likesCount: row.likes_count,
    status: row.status,
    author: {
      id: row.author_id,
      name: row.author_name,
      username: row.author_username,
      avatarUrl: row.author_avatar,
      isVerified: row.author_is_verified,
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isLiked: !!row.is_liked,
    replies: parseInt(row.replies_count || 0, 10),
  };
};

module.exports = { TABLE, LIKES_TABLE, LIST_FIELDS, sanitize, format };
