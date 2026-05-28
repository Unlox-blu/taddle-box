'use strict';

const TABLE = 'communities';
const MEMBERS_TABLE = 'community_members';

const LIST_FIELDS = [
  'id', 'name', 'slug', 'description', 'avatar_url',
  'privacy', 'category', 'member_count', 'post_count', 'is_verified', 'created_at',
].join(', ');

const DETAIL_FIELDS = [
  'id', 'name', 'slug', 'description', 'avatar_url', 'banner_url',
  'privacy', 'category', 'rules', 'owner_id', 'member_count',
  'post_count', 'is_active', 'is_verified', 'metadata', 'created_at', 'updated_at',
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
    avatarUrl: row.avatar_url,
    bannerUrl: row.banner_url,
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
  sanitize, format,
};
