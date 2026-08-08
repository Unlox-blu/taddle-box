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
    id: row.id,
    title: row.title,
    content: row.content,
    media: (row.media || []).map((item) => ({
      id: item.id,
      media_type: item.media_type,
      cloudfront_url: item.cloudfront_url,
      vimeo_thumbnail_url: item.vimeo_thumbnail_url,
      vimeo_uri: item.vimeo_uri,
      duration_seconds: item.duration_seconds,
    })),
    tags: row.tags || [],
    category: row.category || [],
    status: row.status,
    visibility: row.visibility,
    repostOfId: row.repost_of_id,
    repostedByMe: row.is_reposted || false,
    likesCount: row.likes_count ?? 0,
    commentsCount: row.comments_count ?? 0,
    sharesCount: row.shares_count ?? 0,
    viewsCount: row.views_count ?? 0,
    isPinned: row.is_pinned || false,
    isLiked: row.is_liked || false,
    isSaved: true,  // It's in the bookmark list, so it's saved
    author: row.author && {
      id: row.author.id,
      name: row.author.name || row.author.username, // fallbacks
      username: row.author.username,
      avatarUrl: row.author.avatar_url?.cloudfront_url,
      repostsEnabled: row.author.reposts_enabled !== false,
    },
    community: row.community ? {
      id: row.community.id,
      name: row.community.name,
      slug: row.community.slug,
      avatarUrl: row.community.avatar_url?.cloudfront_url,
      privacy: row.community.privacy,
    } : null,
    publishedAt: row.published_at,
  };
};

module.exports = { BOOKMARK_TABLE, POST_TABLE, USER_TABLE, COMMUNITY_TABLE, MEDIA_TABLE, LIST_FIELDS, format };
