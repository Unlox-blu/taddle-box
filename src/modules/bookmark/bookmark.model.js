'use strict';

const BOOKMARK_TABLE = 'bookmark';
const POST_TABLE = 'posts';
const USER_TABLE = 'users';
const COMMUNITY_TABLE = 'communities';
const MEDIA_TABLE = 'media';

// Supported bookmark entity types — extend as new types are added.
const ITEM_TYPES = ['post', 'profile', 'community', 'comment', 'game', 'event'];

// ── Post bookmark formatter ──────────────────────────────────────────────
// Returns the raw row shape directly — nested author/community/media objects
// pass through untouched so the frontend PostCard reads them consistently
// with SharedFeed. Only snake_case → camelCase mapping happens here.
const formatPost = (row) => {
  if (!row) return null;

  return {
    id: row.id,
    title: row.title || null,
    content: row.content,
    media: row.media || [],
    tags: row.tags || [],
    category: row.category || [],
    status: row.status,
    visibility: row.visibility,
    repost_of_id: row.repost_of_id,
    is_reposted: row.is_reposted || false,
    likes_count: row.likes_count ?? 0,
    comments_count: row.comments_count ?? 0,
    shares_count: row.shares_count ?? 0,
    views_count: row.views_count ?? 0,
    is_pinned: row.is_pinned || false,
    is_liked: row.is_liked || false,
    is_saved: true,
    is_xp_claimed: row.is_xp_claimed || false,
    poll_data: row.poll_data || null,
    my_poll_vote: row.my_poll_vote ?? null,
    latitude: row.latitude,
    longitude: row.longitude,
    place: row.place || '',
    author: row.author || null,
    community: row.community || null,
    published_at: row.published_at,
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
