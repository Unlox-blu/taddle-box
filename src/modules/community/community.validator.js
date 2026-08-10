'use strict';

const { z } = require('zod');
const { PRIVACY_TYPES } = require('./community.model');


const typeCheck = (val) => {
    if (typeof val === 'string') {
      try {
        return JSON.parse(val);
      } catch {
        return val;
      }
    }
    return val;
  }

const createCommunitySchema = z.object({
  // Username-style names: letters, numbers, underscores only (no spaces or
  // hyphens) — matches the frontend rule so names and slugs stay consistent.
  name: z
    .string()
    .min(1, 'Name must have at least 1 characters')
    .max(100)
    .regex(/^[a-zA-Z0-9_]+$/, 'Community names can only contain letters, numbers and underscores (no spaces or hyphens)'),
  description: z.string().max(1000).optional(),
  privacy: z.enum(PRIVACY_TYPES).default('public'),
  category: z.preprocess(typeCheck ,z.array(z.string().max(50)).max(5).default([])),
  rules: z.preprocess(typeCheck, z.array(z.object({ title: z.string(), description: z.string() })).max(20)).optional(),
  avatarMediaId: z.preprocess(val => val === '' ? undefined : val, z.string().uuid({ message: 'Invalid avatar media ID format' }).optional()),
  bannerMediaId: z.preprocess(val => val === '' ? undefined : val, z.string().uuid({ message: 'Invalid banner media ID format' }).optional()),
}).strict();

const updateCommunitySchema = createCommunitySchema.partial();

const updateAvatarSchema = z.object({
  avatarMediaId: z.string().uuid({ message: 'Invalid avatar media ID format' })
}).strict();

const updateBannerSchema = z.object({
  bannerMediaId: z.string().uuid({ message: 'Invalid banner media ID format' })
}).strict();

const slugParamsSchema = z.object({
  slug: z.string().min(1, 'Slug must have at least 1 character')
}).strict();

const communityIdParamsSchema = z.object({
  communityId: z.string().uuid({ message: 'Invalid community ID format' })
}).strict();

const communityIdAndUserIdParamsSchema = z.object({
  communityId: z.string().uuid({ message: 'Invalid community ID format' }),
  userId: z.string().uuid({ message: 'Invalid user ID format' })
}).strict();

const updateMemberRoleSchema = z.object({
  role: z.enum(['admin', 'member'])
}).strict();

const transferOwnershipSchema = z.object({
  userId: z.string().uuid({ message: 'Invalid user ID format' })
}).strict();

const paginationQuerySchema = z.object({
  page: z.coerce
    .number({ invalid_type_error: 'Page must be a number' })
    .int({ message: 'Page must be an integer' })
    .positive({ message: 'Page must be greater than zero' })
    .default(1).optional(),

  limit: z.coerce
    .number({ invalid_type_error: 'Limit must be a number' })
    .int({ message: 'Limit must be an integer' })
    .positive({ message: 'Limit must be greater than zero' })
    .max(100, 'Maximum limit allowed is 100')
    .default(10).optional(),

  search: z.string().trim().max(60, 'Search too long').optional(),

  mine: z.enum(['true', 'false', '1', '0']).optional(),
}).strict();

module.exports = { createCommunitySchema, updateCommunitySchema, updateAvatarSchema, updateBannerSchema, slugParamsSchema, communityIdParamsSchema, communityIdAndUserIdParamsSchema, updateMemberRoleSchema, transferOwnershipSchema, paginationQuerySchema };
