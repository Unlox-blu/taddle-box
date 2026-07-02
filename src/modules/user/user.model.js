'use strict';

const TABLE = 'users';

const PUBLIC_FIELDS = [
  'u.id', 'u.name', 'u.username', 'u.avatar_url', 'u.banner_url', 
  'u.bio', 'u.website_url', 'u.follower_count', 'u.following_count',
  'u.post_count', 'u.is_verified', 'u.created_at', 'u.privacy',
].join(', ');

const PRIVATE_FIELDS = [
  'u.id', 'u.name', 'u.username', 'u.email', 'u.gender', 'u.country_code', 'u.phone_number', 'u.app_lock_enabled', 
  'u.date_of_birth', 'u.avatar_url', 'u.banner_url', 'u.bio', 'u.website_url', 'u.role', 
  'u.is_verified', 'u.is_active', 'u.follower_count', 'u.following_count', 'u.post_count',
  'u.email_verified_at', 'u.last_login_at', 'u.google_id', 'u.created_at', 'u.updated_at',
  'u.privacy', 'u.theme'
].join(', ');

const AUTH_FIELDS = [
  'u.id', 'u.email', 'u.name', 'u.username', 'u.password_hash', 'u.role', 'u.app_lock_enabled', 'u.app_lock',
  'u.is_verified', 'u.is_active', 'u.is_banned', 'u.google_id', 'u.refresh_token_hash',
].join(', ');

const SEARCH_FIELDS = [
  'u.id', 'u.name', 'u.username', 'u.avatar_url', 'u.is_verified', 'u.follower_count', 'u.following_count',
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
