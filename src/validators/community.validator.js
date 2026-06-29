'use strict';

const { z } = require('zod');
const { PRIVACY_TYPES } = require('../models/community.model');


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
  name: z.string().min(1, 'Name must be at least 1 characters').max(100),
  description: z.string().max(1000).optional(),
  privacy: z.enum(PRIVACY_TYPES).default('public'),
  category: z.preprocess(typeCheck ,z.array(z.string().max(50)).max(5).default([])),
  rules: z.preprocess(typeCheck, z.array(z.object({ title: z.string(), description: z.string() })).max(20)).optional(),
}).strict();

const updateCommunitySchema = createCommunitySchema.partial();

const updateAvatarSchema = z.object({
  avatarUrl: z.string().uuid()
})

const updateBannerSchema = z.object({
  bannerUrl: z.string().uuid()
})

module.exports = { createCommunitySchema, updateCommunitySchema, updateAvatarSchema, updateBannerSchema };
