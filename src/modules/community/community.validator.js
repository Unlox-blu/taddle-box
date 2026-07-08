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
  name: z.string().min(1, 'Name must have at least 1 characters').max(100),
  description: z.string().max(1000).optional(),
  privacy: z.enum(PRIVACY_TYPES).default('public'),
  category: z.preprocess(typeCheck ,z.array(z.string().max(50)).max(5).default([])),
  rules: z.preprocess(typeCheck, z.array(z.object({ title: z.string(), description: z.string() })).max(20)).optional(),
}).strict();

const updateCommunitySchema = createCommunitySchema.partial();

const updateAvatarSchema = z.object({
  avatarMediaId: z.string().uuid({ message: "Invalid avatarMediaId format" })
}).strict();

const updateBannerSchema = z.object({
  bannerMediaId: z.string().uuid({ message: "Invalid bannerMediaId format" })
}).strict();

const slugParamsSchema = z.object({
  slug: z.string().min(1, 'Slug must have at least 1 characters')
}).strict();

const communityIdParamsSchema = z.object({
  communityId: z.string().uuid({ message: "Invalid communityId format" })
}).strict();

const communityIdAndUserIdParamsSchema = z.object({
  communityId: z.string().uuid({ message: "Invalid communityId format" }),
  userId: z.string().uuid({ message: "Invalid userId format" })
}).strict();

module.exports = { createCommunitySchema, updateCommunitySchema, updateAvatarSchema, updateBannerSchema, slugParamsSchema, communityIdParamsSchema, communityIdAndUserIdParamsSchema };
