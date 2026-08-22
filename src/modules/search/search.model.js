'use strict';

const USER_TABLE = 'users';
const COMMUNITY_TABLE = 'communities';
const EVENT_TABLE = 'events';
const POST_TABLE = 'posts';
const GAME_TABLE = 'game';

const USER_FIELDS = [
  'u.id', 'u.name', 'u.username', 'u.avatar_url', 'u.follower_count', 'u.following_count',
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
  'p.id', 'p.author_id', 'p.community_id', 'p.repost_of_id', 'p.title', 'p.content',
  'p.media', 'p.tags', 'p.status', 'p.visibility',
  'p.likes_count', 'p.comments_count', 'p.shares_count', 'p.views_count',
  'p.is_pinned',
  // Location: repost rows carry none — fall back to the ORIGINAL's tag so
  // search-result cards show the place on reposts too. Requires a LEFT JOIN
  // on `posts orig` in every query using POST_FIELDS.
  'COALESCE(orig.latitude,  p.latitude)  AS latitude',
  'COALESCE(orig.longitude, p.longitude) AS longitude',
  'COALESCE(orig.place,     p.place)     AS place',
  'p.published_at', 'p.created_at',
  `json_build_object('id', u.id, 'name', u.name, 'username', u.username, 'avatar_url', CASE WHEN u.avatar_url IS NULL THEN NULL ELSE json_build_object('cloudfront_url', ua.cloudfront_url) END) AS author`,
  `CASE WHEN c.id IS NULL THEN NULL ELSE json_build_object('id', c.id, 'name', c.name, 'slug', c.slug, 'privacy', c.privacy, 'avatar_url', CASE WHEN c.avatar_url IS NULL THEN NULL ELSE json_build_object('cloudfront_url', ca.cloudfront_url) END) END AS community`,
].join(', ');

// Games are returned as-is (matches game module's formatGame shape) so the app
// can render them directly with the existing Game type.
const GAME_FIELDS = [
  'id', 'name', 'slug', 'description', 'thumbnail', 'category',
  'difficulty', 'is_active', 'metadata', 'created_at', 'updated_at',
].join(', ');


module.exports = {
    USER_TABLE, COMMUNITY_TABLE, EVENT_TABLE, POST_TABLE, GAME_TABLE,
    USER_FIELDS, COMMUNITY_FIELDS, EVENT_FIELDS, POST_FIELDS, GAME_FIELDS,
}