'use strict';

const { z } = require('zod');

const updateProfileSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  bio: z.string().max(500, 'Bio cannot exceed 500 characters').optional(),
  websiteUrl: z.string().url('Invalid URL').optional().or(z.literal('')),
}).strict();

const updateUsernameSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(30)
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers and underscores'),
}).strict();

module.exports = { updateProfileSchema, updateUsernameSchema };
