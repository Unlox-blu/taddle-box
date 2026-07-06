'use strict';
const FOLLOWER_TABLE = 'followers';
const USER_TABLE = 'users';
const POST_TABLE = 'posts';
const EVENT_TABLE = 'events';
const COMMUNITY_TABLE = 'communities';

const USER_FIELDS = [
  'u.id', 'u.name', 'u.username', 'u.date_of_birth', 'u.bio', 'u.website_url',
  'u.follower_count', 'u.following_count', 'u.post_count', 'u.privacy', 'gender'
].join(', ');

const POST_FIELDS = [
  'p.id', 'p.author_id', 'p.community_id', 'p.title',
  'p.media', 'p.post_type', 'p.tags', 'p.status', 'p.visibility',
  'p.likes_count', 'p.comments_count', 'p.shares_count', 'p.views_count',
  'p.is_pinned', 'p.published_at', 'p.created_at',
  'u.name AS author_name', 'u.username AS author_username',
  'u.is_verified AS author_is_verified', 'ua.cloudfront_url AS author_avatar',
  'c.name AS community_name', 'c.slug   AS community_slug',
  'ca.cloudfront_url AS community_avatar',
].join(', ');


const EVENT_FIELDS = [
  'id', 'organizer_id', 'community_id', 'title', 'cover_image_url', 'description',
  'event_type', 'status', 'start_time', 'end_time', 'timezone',
  'location', 'is_free', 'ticket_price_cents', 'currency', 'registration_deadline',
  'attendee_count', 'max_attendees', 'tags', 'is_featured',
].join(', ');


const COMMUNITY_FIELDS = [
  'c.id', 'c.name', 'c.slug', 'c.description', 
  'c.privacy', 'c.category', 'c.rules', 'c.owner_id', 'c.member_count',
  'c.post_count', 'c.created_at', 'c.updated_at',
].join(', ');

const formatUser = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    avatarUrl: row.avatar_media_url,
    bannerUrl: row.banner_media_url,
    bio: row.bio,
    websiteUrl: row.website_url,
    followerCount: row.follower_count,
    followingCount: row.following_count,
    postCount: row.post_count,
    dateOfBirth: row.date_of_birth,
    gender: row.gender,
    privacy: row.privacy,
  };
};

const formatPost = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    media: row.media || [],
    postType: row.post_type,
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

const formatEvent = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    organizerId: row.organizer_id,
    communityId: row.community_id,
    title: row.title,
    description: row.description,
    coverImageUrl: row.cover_image_url,
    eventType: row.event_type,
    status: row.status,
    startTime: row.start_time,
    endTime: row.end_time,
    timezone: row.timezone,
    location: row.location,
    isFree: row.is_free,
    ticketPriceCents: row.ticket_price_cents,
    currency: row.currency,
    attendeeCount: row.attendee_count,
    maxAttendees: row.max_attendees,
    tags: row.tags || [],
    isFeatured: row.is_featured,
    registrationDeadline: row.registration_deadline,
  };
};

const formatCommunity = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    avatarUrl: row.avatar_media_url,
    bannerUrl: row.banner_media_url,
    privacy: row.privacy,
    category: row.category || [],
    rules: row.rules || [],
    ownerId: row.owner_id,
    memberCount: row.member_count,
    postCount: row.post_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};



module.exports = { FOLLOWER_TABLE, USER_TABLE, POST_TABLE, EVENT_TABLE, COMMUNITY_TABLE, USER_FIELDS, POST_FIELDS, EVENT_FIELDS, COMMUNITY_FIELDS, formatUser, formatPost, formatEvent, formatCommunity, };
