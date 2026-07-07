'use strict';

const TABLE = 'communities';
const MEMBERS_TABLE = 'community_members';

const LIST_FIELDS = [
  'c.id', 'c.name', 'c.slug', 'c.description', 'c.avatar_url',
  'c.privacy', 'c.category', 'c.member_count', 'c.post_count', 'c.is_verified', 'c.created_at',
].join(', ');

const DETAIL_FIELDS = [
  'c.id', 'c.name', 'c.slug', 'c.description', 'c.avatar_url', 'c.banner_url',
  'c.privacy', 'c.category', 'c.rules', 'c.owner_id', 'c.member_count',
  'c.post_count', 'c.is_active', 'c.is_verified', 'c.metadata', 'c.created_at', 'c.updated_at',
].join(', ');

const MEDIA_FIELDS = [
  'c.avatar_url', 'c.banner_url',
].join(', ');

const PRIVACY_TYPES = ['public', 'private', 'restricted'];
const MEMBER_ROLES = ['member', 'moderator', 'admin'];
const MEMBER_STATUSES = ['active', 'pending', 'banned'];

const sanitize = (row) => {
  if (!row) return null;
  const { deleted_at, ...safe } = row;
  return safe;
};

const format = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    avatarMediaId: row.avatar_url,
    bannerMediaId: row.banner_url,
    avatarUrl: row.avatar_media_url,
    bannerUrl: row.banner_media_url,
    privacy: row.privacy,
    category: row.category || [],
    rules: row.rules || [],
    ownerId: row.owner_id,
    memberCount: row.member_count,
    postCount: row.post_count,
    isVerified: row.is_verified,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

module.exports = {
  TABLE, MEMBERS_TABLE,
  LIST_FIELDS, DETAIL_FIELDS,
  PRIVACY_TYPES, MEMBER_ROLES, MEMBER_STATUSES,
  MEDIA_FIELDS,
  sanitize, format,
};
