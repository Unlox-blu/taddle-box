'use strict';

const BOOKMARK_TABLE = 'bookmark';
const POST_TABLE = 'posts';
const USER_TABLE = 'users';
const COMMUNITY_TABLE = 'communities';
const MEDIA_TABLE = 'media';

// Supported bookmark entity types — extend as new types are added.
const ITEM_TYPES = ['post', 'profile', 'community', 'comment', 'game', 'event'];

// ── Post bookmark formatter (the existing detailed format) ──────────────────
const formatPost = (row) => {
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
    isSaved: true,
    pollData: row.poll_data || null,
    myPollVote: row.my_poll_vote ?? null,
    location: (row.latitude != null && row.longitude != null) ? {
      lat: Number(row.latitude),
      lon: Number(row.longitude),
      place: row.place || '',
    } : null,
    author: row.author && {
      id: row.author.id,
      name: row.author.name || row.author.username,
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
      repostsEnabled: row.community.reposts_enabled !== false,
    } : null,
    publishedAt: row.published_at,
  };
};

// ── Profile bookmark formatter ──────────────────────────────────────────────
const formatProfile = (row) => {
  if (!row) return null;
  const avatar = row.avatar_cloudfront_url || row.avatar_url || null;
  return {
    id: row.id,
    name: row.name || row.username,
    username: row.username,
    avatarUrl: avatar,
    avatar: avatar,
    bio: row.bio || '',
    level: row.level || 1,
    rank: row.rank || 'Beginner',
    privacy: row.privacy || 'public',
    follower_count: row.follower_count ?? 0,
    followerCount: row.follower_count ?? 0,
    post_count: row.post_count ?? 0,
    postCount: row.post_count ?? 0,
    isFollowing: row.is_following || false,
    bookmarkedAt: row.bookmarked_at,
  };
};

// ── Community bookmark formatter ────────────────────────────────────────────
const formatCommunity = (row) => {
  if (!row) return null;
  const avatar = row.avatar_cloudfront_url || row.avatar_url || null;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description || '',
    category: row.category || '',
    privacy: row.privacy || 'public',
    member_count: row.member_count ?? 0,
    memberCount: row.member_count ?? 0,
    post_count: row.post_count ?? 0,
    postCount: row.post_count ?? 0,
    avatarUrl: avatar,
    avatar: avatar,
    isMember: row.is_member || false,
    bookmarkedAt: row.bookmarked_at,
  };
};

// ── Generic formatter that dispatches by item_type ──────────────────────────
const format = (row, itemType) => {
  if (!row) return null;
  switch (itemType || row.item_type) {
    case 'post':     return formatPost(row);
    case 'profile':  return formatProfile(row);
    case 'community': return formatCommunity(row);
    // Future types: return a lightweight shape so the UI can render something.
    default:
      return {
        id: row.item_id || row.id,
        type: row.item_type,
        name: row.name || row.title || 'Untitled',
        bookmarkedAt: row.bookmarked_at || row.created_at,
      };
  }
};

module.exports = {
  BOOKMARK_TABLE,
  POST_TABLE,
  USER_TABLE,
  COMMUNITY_TABLE,
  MEDIA_TABLE,
  ITEM_TYPES,
  format,
  formatPost,
  formatProfile,
  formatCommunity,
};
