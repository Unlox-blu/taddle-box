'use strict';

const USER_TABLE = 'users';

const VERIFy_EMAIL_TABLE = 'verify_email_otp';

const VERIFy_EMAIL_FIELDS = [
  'id',
  'email',
  'otp',
  'otp_exp_in',
  'is_verified',
  'verification_expires_at',
  'created_at',
  'updated_at',
].join(', ');

const RETURNING_USER_FIELDS = ['id', 'name', 'username'].join(', ');

const USER_DETAIL = ['u.id', 'u.name', 'u.username', 'u.email', 'u.role'];

const AUTH_FIELDS = [
  'u.id',
  'u.email',
  'u.name',
  'u.username',
  'u.password_hash',
  'u.role',
  'u.app_lock_enabled',
  'u.app_lock',
  'u.flags',
  'u.is_active',
  'u.is_banned',
  'u.google_id',
  'u.apple_id',
  'u.refresh_token_hash',
].join(', ');

const APP_LOCK = ['u.id', 'u.app_lock_enabled', 'u.app_lock'].join(', ');

const SECURE_FIELDS = [
  'u.id',
  'u.email',
  'u.app_lock_enabled',
  'u.app_lock',
  'u.role',
  'u.flags',
  'u.is_active',
  'u.email_verified_at',
  'u.last_login_at',
  'u.google_id',
  'u.apple_id',
  'u.created_at',
  'u.updated_at',
  'u.privacy',
  'u.theme',
].join(', ');

const PRIVATE_FIELDS = [
  'u.id',
  'u.name',
  'u.username',
  'u.email',
  'u.gender',
  'u.country_code',
  'u.phone_number',
  'u.app_lock_enabled',
  'u.date_of_birth',
  'u.avatar_url',
  'u.banner_url',
  'u.bio',
  'u.website_url',
  'u.role',
  'u.flags',
  'u.is_active',
  'u.follower_count',
  'u.following_count',
  'u.post_count',
  'u.email_verified_at',
  'u.last_login_at',
  'u.google_id',
  'u.apple_id',
  'u.created_at',
  'u.updated_at',
  'u.privacy',
  'u.theme',
].join(', ');

const TOKEN = ['u.id', 'u.role', 'u.is_active', 'u.is_banned', 'u.flags', 'u.privacy'].join(
  ', '
);

const LOGIN = [
  'u.id',
  'u.name',
  'u.username',
  'u.email',
  'u.password_hash',
  'u.role',
  'u.is_active',
  'u.is_banned',
  'u.flags',
  'u.country_code',
  'u.phone_number',
  'u.refresh_token_hash',
  'u.last_login_at',
].join(', ');

const GOOGLE_LOGIN = [
  'u.id',
  'u.name',
  'u.username',
  'u.email',
  'u.google_id',
  'u.role',
  'u.is_active',
  'u.is_banned',
  'u.flags',
].join(', ');

const EMAIL_VERIFY = [
  'u.id',
  'u.email',
  'u.email_verify_token_hash',
  'u.email_verify_token_exp',
  'u.email_verified_at',
].join(', ');

const PASSWORD_RESET = [
  'u.id',
  'u.email',
  'u.password_reset_token_hash',
  'u.password_reset_token_exp',
].join(', ');

const PUBLIC_PROFILE = [
  'u.id',
  'u.name',
  'u.username',
  'u.avatar_url',
  'u.banner_url',
  'u.bio',
  'u.website_url',
  'u.follower_count',
  'u.following_count',
  'u.post_count',
  'u.flags',
  'u.created_at',
  'u.privacy',
].join(', ');

const PRIVATE_PROFILE = [
  'u.id',
  'u.name',
  'u.username',
  'u.email',
  'u.country_code',
  'u.phone_number',
  'u.gender',
  'u.date_of_birth',
  'u.avatar_url',
  'u.banner_url',
  'u.bio',
  'u.website_url',
  'u.role',
  'u.theme',
  'u.privacy',
  'u.flags',
  'u.is_active',
  'u.follower_count',
  'u.following_count',
  'u.post_count',
  'u.email_verified_at',
  'u.last_login_at',
  'u.created_at',
  'u.updated_at',
].join(', ');

const FEED_AUTHOR = ['u.id', 'u.name', 'u.username', 'u.avatar_url', 'u.flags'].join(', ');

const SEARCH = ['u.id', 'u.name', 'u.username', 'u.avatar_url', 'u.bio', 'u.flags'].join(
  ', '
);

const FOLLOW_LIST = ['u.id', 'u.name', 'u.username', 'u.avatar_url', 'u.bio', 'u.flags'].join(
  ', '
);

const NOTIFICATION = ['u.id', 'u.name', 'u.username', 'u.avatar_url', 'u.flags'].join(', ');

const CHAT = ['u.id', 'u.name', 'u.username', 'u.avatar_url'].join(', ');

const ADMIN = [
  'u.id',
  'u.name',
  'u.username',
  'u.email',
  'u.role',
  'u.flags',
  'u.is_active',
  'u.is_banned',
  'u.follower_count',
  'u.following_count',
  'u.post_count',
  'u.created_at',
  'u.updated_at',
].join(', ');

const ROLES = ['user', 'moderator', 'admin', 'superadmin'];

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
    flags: row.flags,
    isActive: row.is_active,
    followerCount: row.follower_count,
    followingCount: row.following_count,
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
    appleId: row.apple_id,
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
    dateOfBirth: row.date_of_birth,
    gender: row.gender,
    appLock: row.app_lock,
    appLockEnabled: row.app_lock_enabled,
  };
};

module.exports = {
  VERIFy_EMAIL_TABLE,
  VERIFy_EMAIL_FIELDS,
  USER_TABLE,
  PRIVATE_FIELDS,
  AUTH_FIELDS,
  ROLES,
  RETURNING_USER_FIELDS,
  SECURE_FIELDS,
  TOKEN,
  LOGIN,
  APP_LOCK,
  GOOGLE_LOGIN,
  EMAIL_VERIFY,
  PASSWORD_RESET,
  PUBLIC_PROFILE,
  PRIVATE_PROFILE,
  FEED_AUTHOR,
  SEARCH,
  FOLLOW_LIST,
  NOTIFICATION,
  CHAT,
  ADMIN,
  USER_DETAIL,
  sanitize,
  format,
};
