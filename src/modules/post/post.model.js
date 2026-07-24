'use strict';

const TABLE = 'posts';
const LIKES_TABLE = 'post_likes';
const VIEWS_TABLE = 'post_views';

// Full detail view — used in single post fetch with author + community JOINs
const DETAIL_FIELDS = [
  'p.id', 'p.author_id', 'p.community_id', 'p.title', 'p.content',
  'p.media', 'p.tags', 'p.category', 'p.status',
  'p.visibility', 'p.likes_count', 'p.comments_count', 'p.shares_count',
  'p.views_count', 'p.is_pinned', 'p.poll_data', 'p.link_data',
  'p.published_at', 'p.created_at', 'p.updated_at',
  'u.name AS author_name', 'u.username AS author_username', 'u.avatar_url AS author_avatar',
  'c.name AS community_name', 'c.privacy AS community_privacy','c.slug AS community_slug', 'c.avatar_url AS community_avatar',
].join(', ');

// Light list view — used in feed and browse
const LIST_FIELDS = [
  'p.id', 'p.author_id', 'p.community_id', 'p.title', 'p.content',
  'p.media', 'p.tags', 'p.status', 'p.visibility',
  'p.likes_count', 'p.comments_count', 'p.shares_count', 'p.views_count',
  'p.is_pinned', 'p.published_at', 'p.created_at',
  'u.name AS author_name', 'u.username AS author_username',
  'ua.cloudfront_url AS author_avatar',
  'c.name AS community_name', 'c.slug   AS community_slug',
  'ca.cloudfront_url AS community_avatar',
].join(', ');

const POST_STATUSES = ['draft', 'published', 'archived', 'removed'];
const VISIBILITIES = ['public', 'community_only', 'private'];

const sanitize = (row) => {
  if (!row) return null;
  const { deleted_at, ...safe } = row;
  return safe;
};

const format = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    media: row.media || [],
    tags: row.tags || [],
    category: row.category || [],
    status: row.status,
    visibility: row.visibility,
    likesCount: row.likes_count,
    commentsCount: row.comments_count,
    sharesCount: row.shares_count,
    viewsCount: row.views_count,
    isPinned: row.is_pinned,
    pollData: row.poll_data || null,
    linkData: row.link_data || null,
    author: {
      id: row.author_id,
      name: row.author_name,
      username: row.author_username,
      avatarUrl: row.author_avatar,
      isVerified: row.author_is_verified,
    },
    community: row.community_id ? {
      id: row.community_id,
      name: row.community_name,
      slug: row.community_slug,
      avatarUrl: row.community_avatar,
    } : null,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

module.exports = {
  TABLE, LIKES_TABLE, VIEWS_TABLE,
  DETAIL_FIELDS, LIST_FIELDS,
  POST_STATUSES, VISIBILITIES,
  sanitize, format,
};
