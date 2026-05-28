'use strict';

const TABLE = 'users';

const PUBLIC_FIELDS = [
  'id', 'name', 'username', 'avatar_url', 'banner_url',
  'bio', 'website_url', 'follower_count', 'following_count',
  'post_count', 'is_verified', 'created_at',
].join(', ');

const PRIVATE_FIELDS = [
  'id', 'name', 'username', 'email', 'avatar_url', 'banner_url',
  'bio', 'website_url', 'role', 'is_verified', 'is_active',
  'follower_count', 'following_count', 'post_count',
  'email_verified_at', 'last_login_at', 'google_id', 'created_at', 'updated_at',
].join(', ');

const AUTH_FIELDS = [
  'id', 'email', 'username', 'password_hash', 'role',
  'is_verified', 'is_active', 'is_banned', 'google_id',
].join(', ');

const SEARCH_FIELDS = [
  'id', 'name', 'username', 'avatar_url', 'is_verified', 'follower_count',
].join(', ');

const ROLES = ['user', 'moderator', 'admin', 'superadmin'];

/**
 * Strips ALL sensitive token fields from a raw DB row.
 * Always call this before returning user data to a controller.
 */
const sanitize = (row) => {
  if (!row) return null;
  const {
    password_hash,
    refresh_token_hash,
    email_verify_token_hash,
    email_verify_token_exp,
    password_reset_token_hash,
    password_reset_token_exp,
    ...safe
  } = row;
  return safe;
};

/** Converts snake_case DB row → camelCase API response */
const format = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    email: row.email,
    avatarUrl: row.avatar_url,
    bannerUrl: row.banner_url,
    bio: row.bio,
    websiteUrl: row.website_url,
    role: row.role,
    isVerified: row.is_verified,
    isActive: row.is_active,
    followerCount: row.follower_count,
    followingCount: row.following_count,
    postCount: row.post_count,
    emailVerifiedAt: row.email_verified_at,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

module.exports = { TABLE, PUBLIC_FIELDS, PRIVATE_FIELDS, AUTH_FIELDS, SEARCH_FIELDS, ROLES, sanitize, format };
