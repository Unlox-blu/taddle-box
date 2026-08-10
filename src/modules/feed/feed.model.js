'use strict';

const TABLE = 'posts';
const LIKES_TABLE = 'post_likes';
const VIEWS_TABLE = 'post_views';

// Full detail view — used in single post fetch with author + community JOINs
const DETAIL_FIELDS = [
  'p.id', 'p.author_id', 'p.community_id', 'p.repost_of_id', 'p.title', 'p.content',
  'p.media', 'p.tags', 'p.category', 'p.status',
  'p.visibility', 'p.likes_count', 'p.comments_count', 'p.shares_count',
  'p.views_count', 'p.is_pinned', 'p.poll_data', 'p.link_data',
  'p.published_at', 'p.created_at', 'p.updated_at',
  'u.name AS author_name', 'u.username AS author_username', 'u.avatar_url AS author_avatar',
  'c.name AS community_name', 'c.privacy AS community_privacy','c.slug AS community_slug', 'c.avatar_url AS community_avatar',
].join(', ');

// Light list view — used in feed and browse
const LIST_FIELDS = [
  'p.id', 'p.author_id', 'p.community_id', 'p.repost_of_id', 'p.title', 'p.content',
  'p.media', 'p.tags', 'p.status', 'p.visibility',
  'p.likes_count', 'p.comments_count', 'p.shares_count', 'p.views_count',
  'p.is_pinned', 'p.published_at', 'p.created_at',
  'u.name AS author_name', 'u.username AS author_username',
  'ua.cloudfront_url AS author_avatar',
  'c.name AS community_name', 'c.slug   AS community_slug', 'c.privacy AS community_privacy',
  'ca.cloudfront_url AS community_avatar',
].join(', ');

const POST_STATUSES = ['draft', 'published', 'archived', 'removed'];
const VISIBILITIES = ['public', 'community_only', 'private'];

const sanitize = (row) => {
  if (!row) return null;
  const { deleted_at, ...safe } = row;
  return safe;
};

// const format = (row) => {
//   if (!row) return null;
//   return {
//     id: row.id,
//     title: row.title,
//     content: row.content,
//     media: row.media || [],
//     tags: row.tags || [],
//     category: row.category || [],
//     status: row.status,
//     visibility: row.visibility,
//     repostOfId: row.repost_of_id,
//     repostedByMe: row.is_reposted || false,
//     likesCount: row.likes_count,
//     commentsCount: row.comments_count,
//     sharesCount: row.shares_count,
//     viewsCount: row.views_count,
//     isPinned: row.is_pinned,
//     isLiked: row.is_liked || false,
//     isSaved: row.is_bookmarked || false,
//     isXpClaimed: row.is_xp_claimed || false,
//     pollData: row.poll_data || null,
//     linkData: row.link_data || null,
//     author: {
//       id: row.author_id,
//       name: row.author_name,
//       username: row.author_username,
//       avatarUrl: row.author_avatar,
//       isVerified: row.author_is_verified,
//       repostsEnabled: row.author_reposts_enabled !== false,
//     },
//     community: row.community_id ? {
//       id: row.community_id,
//       name: row.community_name,
//       slug: row.community_slug,
//       avatarUrl: row.community_avatar,
//       privacy: row.community_privacy,
//     } : null,
//     publishedAt: row.published_at,
//     createdAt: row.created_at,
//     updatedAt: row.updated_at,
//   };
// };


const format = (row) => {
  if (!row) return null;

  const formatRepostData = (repost) => {
    if (!repost) return null;

    return {
      id: repost.id,

      title: repost.title,
      content: repost.content,

      media: repost.media || [],
      tags: repost.tags || [],
      category: repost.category || [],

      status: repost.status,
      visibility: repost.visibility,

      repostOfId: repost.repost_of_id,

      likesCount: repost.likes_count || 0,
      commentsCount: repost.comments_count || 0,
      sharesCount: repost.shares_count || 0,
      viewsCount: repost.views_count || 0,

      isPinned: repost.is_pinned || false,

      publishedAt: repost.published_at,
      createdAt: repost.created_at,
      updatedAt: repost.updated_at,

      author: repost.author
        ? {
            id: repost.author.id,
            name: repost.author.name,
            username: repost.author.username,
            avatarUrl: repost.author.avatarUrl,
            isVerified: repost.author.isVerified || false,
            repostsEnabled: repost.author.repostsEnabled !== false,
          }
        : null,

      community: repost.community
        ? {
            id: repost.community.id,
            name: repost.community.name,
            slug: repost.community.slug,
            avatarUrl: repost.community.avatarUrl,
            privacy: repost.community.privacy,
          }
        : null,
    };
  };

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

    // Original / parent post
    repostData: formatRepostData(row.repost_data),

    repostedByMe: row.is_reposted || false,

    likesCount: row.likes_count || 0,
    commentsCount: row.comments_count || 0,
    sharesCount: row.shares_count || 0,
    viewsCount: row.views_count || 0,

    isPinned: row.is_pinned || false,

    isLiked: row.is_liked || false,
    isSaved: row.is_bookmarked || false,
    isXpClaimed: row.is_xp_claimed || false,

    pollData: row.poll_data || null,
    linkData: row.link_data || null,

    author: {
      id: row.author_id,
      name: row.author_name,
      username: row.author_username,
      avatarUrl: row.author_avatar,
      isVerified: row.author_is_verified || false,
      repostsEnabled: row.author_reposts_enabled !== false,
    },

    community: row.community_id
      ? {
          id: row.community_id,
          name: row.community_name,
          slug: row.community_slug,
          avatarUrl: row.community_avatar,
          privacy: row.community_privacy,
        }
      : null,

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
