'use strict';

const TABLE = 'users';

const PUBLIC_FIELDS = [
  'u.id', 'u.name', 'u.username', 'u.avatar_url', 'u.banner_url', 
  'u.bio', 'u.website_url', 'u.follower_count', 'u.following_count',
  'u.post_count', 'u.created_at', 'u.privacy',
].join(', ');

const PRIVATE_FIELDS = [
  'u.id', 'u.name', 'u.username', 'u.email', 'u.date_of_birth', 'u.avatar_url', 'u.banner_url', 'u.bio', 'u.website_url', 'u.role', 
 'u.is_active', 'u.follower_count', 'u.following_count', 'u.post_count',
  'u.email_verified_at', 'u.last_login_at', 'u.google_id', 'u.created_at', 'u.updated_at',
  'u.privacy', 'u.theme', 'u.apple_refresh_token', 'u.occupation', 'u.organization', 'u.location', 'u.interests', 'u.phone_number', 'u.country_code'
].join(', ');

const AUTH_FIELDS = [
  'u.id', 'u.email', 'u.name', 'u.username', 'u.password_hash', 'u.role', 'u.app_lock_enabled', 'u.app_lock',
  'u.is_verified', 'u.is_active', 'u.is_banned', 'u.google_id', 'u.refresh_token_hash',
].join(', ');

const SEARCH_FIELDS = [
  'u.id', 'u.name', 'u.username', 'u.avatar_url', 'u.follower_count', 'u.following_count',
].join(', ');

const MEDIA_FIELDS = [
  'u.avatar_url', 'u.banner_url',
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
    app_lock_enabled,
    app_lock,
    ...safe
  } = row;
  return safe;
};

const format = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    email: row.email,
    avatarUrl: row.avatar_media_url || row.avatar_url,
    bannerUrl: row.banner_media_url || row.banner_url,
    bio: row.bio,
    websiteUrl: row.website_url,
    role: row.role,
    isVerified: row.is_verified,
    isActive: row.is_active,
    followerCount: row.follower_count,
    followingCount: row.following_count,
    followerId: row.follower_id,
    followingId: row.following_id,
    status: row.status,
    postCount: row.post_count,
    emailVerifiedAt: row.email_verified_at,
    lastLoginAt: row.last_login_at,
    otp: row.otp,
    expIn: row.otp_exp_in,
    verificationExpiresAt: row.verification_expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    passwordHash: row.password_hash,
    googleId: row.google_id,
    isBanned: row.is_banned,
    refreshTokenHash: row.refresh_token_hash,
    emailVerifyTokenHash: row.email_verify_token_hash,
    emailVerifyTokenExp: row.email_verify_token_exp,
    passwordResetTokenHash: row.password_reset_token_hash,
    passwordResetTokenExp: row.password_reset_token_exp,
    deletedAt: row.deleted_at,
    privacy: row.privacy,
    theme: row.theme,
    countryCode: row.country_code,
    phoneNumber: row.phone_number,
    phone: row.phone_number,
    dateOfBirth: row.date_of_birth,
    gender: row.gender,
    appLock: row.app_lock,
    appLockEnabled: row.app_lock_enabled,
    appleRefreshToken: row.apple_refresh_token,
    occupation: row.occupation,
    organization: row.organization,
    location: row.location,
    interests: row.interests,
  };
};

module.exports = { TABLE, PUBLIC_FIELDS, PRIVATE_FIELDS, AUTH_FIELDS, SEARCH_FIELDS, MEDIA_FIELDS, ROLES, sanitize, format };
