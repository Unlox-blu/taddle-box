'use strict';

const { z } = require('zod');
const { PRIVACY_TYPES } = require('../models/community.model');

const createCommunitySchema = z.object({
  name: z.string().min(3, 'Name must be at least 3 characters').max(100),
  description: z.string().max(1000).optional(),
  privacy: z.enum(PRIVACY_TYPES).default('public'),
  category: z.array(z.string().max(50)).max(5).default([]),
  rules: z.array(z.object({ title: z.string(), description: z.string() })).max(20).optional(),
}).strict();

const updateCommunitySchema = createCommunitySchema.partial();

module.exports = { createCommunitySchema, updateCommunitySchema };
