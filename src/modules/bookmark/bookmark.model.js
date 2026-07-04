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
    postType: row.post_type,
    tags: row.tags || [],
    categories: row.category || [],
    likes: row.likes_count ?? 0,
    comments: row.comments_count ?? 0,
    shares: row.shares_count ?? 0,
    views: row.views_count ?? 0,
    publishedAt: row.published_at,

    author: row.author && {
      id: row.author.id,
      username: row.author.username,
      avatar: row.author.avatar_url
        ? {
            url: row.author.avatar_url.cloudfront_url,
          }
        : null,
    },

    community: row.community
      ? {
          id: row.community.id,
          name: row.community.name,
          slug: row.community.slug,
          avatar: row.community.avatar_url 
          ? {
            url: row.community.avatar_url.cloudfront_url,
            }
          : null,
        }
        : null,

    media: (row.media || []).map((item) => ({
      id: item.id,
      type: item.media_type,
      url: item.cloudfront_url,
      thumbnail: item.vimeo_thumbnail_url,
      vimeoUri: item.vimeo_uri,
      duration: item.duration_seconds,
    })),
  };
};

module.exports = { BOOKMARK_TABLE, POST_TABLE, USER_TABLE, COMMUNITY_TABLE, MEDIA_TABLE, LIST_FIELDS, format };
