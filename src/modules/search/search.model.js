'use strict';

const USER_TABLE = 'users';
const COMMUNITY_TABLE = 'communities';
const EVENT_TABLE = 'events';
const POST_TABLE = 'posts';

const USER_FIELDS = [
  'u.id', 'u.name', 'u.username', 'u.avatar_url', 'u.is_verified', 'u.follower_count', 'u.following_count',
  'ua.cloudfront_url AS user_avatar',
].join(', ');

const COMMUNITY_FIELDS = [
  'c.id', 'c.name', 'c.slug', 'c.description', 'c.avatar_url',
  'c.privacy', 'c.category', 'c.member_count', 'c.post_count', 'c.is_verified', 'c.created_at',
  'ca.cloudfront_url AS community_avatar'
].join(', ');

const EVENT_FIELDS = [
  'id', 'organizer_id', 'community_id', 'title', 'cover_image_url', 'description',
  'event_type', 'status', 'start_time', 'end_time', 'timezone',
  'location', 'is_free', 'ticket_price_cents', 'currency', 'registration_deadline',
  'attendee_count', 'max_attendees', 'tags', 'is_featured',
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


module.exports = {
    USER_TABLE, COMMUNITY_TABLE, EVENT_TABLE, POST_TABLE,
    USER_FIELDS, COMMUNITY_FIELDS, EVENT_FIELDS, POST_FIELDS,
}