'use strict';

const TABLE = 'posts';
const LIKES_TABLE = 'post_likes';
const VIEWS_TABLE = 'post_views';

// SSOT: nested json_build_object for author and community
const AUTHOR_EXPR = `json_build_object('id', u.id, 'name', u.name, 'username', u.username, 'avatar_url', CASE WHEN u.avatar_url IS NULL THEN NULL ELSE json_build_object('cloudfront_url', ua.cloudfront_url) END) AS author`;
const COMMUNITY_EXPR = `CASE WHEN c.id IS NULL THEN NULL ELSE json_build_object('id', c.id, 'name', c.name, 'slug', c.slug, 'privacy', c.privacy, 'avatar_url', CASE WHEN c.avatar_url IS NULL THEN NULL ELSE json_build_object('cloudfront_url', ca.cloudfront_url) END) END AS community`;

const DETAIL_FIELDS = [
  'p.id', 'p.author_id', 'p.community_id', 'p.repost_of_id', 'p.title', 'p.content',
  'p.media', 'p.tags', 'p.category', 'p.status',
  'p.visibility', 'p.likes_count', 'p.comments_count', 'p.shares_count',
  'p.views_count', 'p.is_pinned', 'p.poll_data', 'p.link_data',
  'p.latitude', 'p.longitude', 'p.place',
  'p.published_at', 'p.created_at', 'p.updated_at',
  AUTHOR_EXPR, COMMUNITY_EXPR,
].join(', ');

const LIST_FIELDS = [
  'p.id', 'p.author_id', 'p.community_id', 'p.repost_of_id', 'p.title', 'p.content',
  'p.media', 'p.tags', 'p.status', 'p.visibility',
  'p.likes_count', 'p.comments_count', 'p.shares_count', 'p.views_count',
  'p.is_pinned', 'p.poll_data',
  'p.published_at', 'p.created_at',
  AUTHOR_EXPR, COMMUNITY_EXPR,
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
    repostOfId: row.repost_of_id,
    repostedByMe: !!row.is_reposted,
    likes: row.likes_count ?? 0,
    comments: row.comments_count ?? 0,
    shares: row.shares_count ?? 0,
    viewsCount: row.views_count,
    isPinned: row.is_pinned,
    isLiked: !!row.is_liked,
    isSaved: !!row.is_bookmarked,
    isXpClaimed: !!row.is_xp_claimed,
    pollData: row.poll_data || null,
    myPollVote: row.my_poll_vote ?? null,
    linkData: row.link_data || null,
    location: (row.latitude != null && row.longitude != null)
      ? { lat: Number(row.latitude), lon: Number(row.longitude), place: row.place || '' }
      : row.location || null,
    author: row.author || {},
    community: row.community || undefined,
    author_reposts_enabled: row.author_reposts_enabled,
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
