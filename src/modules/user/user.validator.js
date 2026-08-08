'use strict';

const { z } = require('zod');

const usernameRules = z
  .string()
  .min(3, 'Username must be at least 3 characters')
  .max(30, 'Username must be at most 30 characters')
  .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers and underscores');

const transformToLowerCase = (val) => typeof val === 'string' ? val.trim().toLowerCase() : val

const updateProfileSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  bio: z.string().max(500, 'Bio cannot exceed 500 characters').optional(),
  websiteUrl: z.string().url('Invalid URL').optional().or(z.literal('')),
}).strict();

const updateUsernameSchema = z.object({
  username: usernameRules,
}).strict();

const updatePrivacySchema = z.object({
  privacy: z.preprocess(transformToLowerCase, z.enum(['public','private'], { errorMap: () => ({ message: 'Invalid privacy' }) }))
})

const updateAvatarSchema = z.object({
  avatarMediaId: z.string().uuid(),
})

const updateBannerSchema = z.object({
  bannerMediaId: z.string().uuid(),
})

const usernameSchema = z.object({
  username: z.string().min(1, {message: "Username can not be empty"})
}).strict()

const userIdSchema = z.object({
  userId: z.string().uuid({ message: 'Invalid user ID format' })
}).strict()

const followerIdSchema = z.object({
  followerId: z.string().uuid({ message: 'Invalid follower ID format' })
}).strict()

// GEO location capture body — lat/lng are required, place is an optional
// free-text reverse-geocoded place name (e.g. "Bengaluru, Karnataka").
const locationBodySchema = z.object({
  lat: z.number().min(-90).max(90, 'Invalid latitude'),
  lng: z.number().min(-180).max(180, 'Invalid longitude'),
  accuracy: z.number().nonnegative().optional(),
  place: z.string().max(255, 'Place name too long').optional(),
}).strict()

const presenceBodySchema = z.object({
  userIds: z.array(z.string().uuid({ message: 'Invalid user ID format' })).max(50, 'Too many users').optional(),
}).strict()

module.exports = { updateProfileSchema, updateUsernameSchema, updatePrivacySchema, updateBannerSchema, updateAvatarSchema, usernameSchema, userIdSchema, followerIdSchema, locationBodySchema, presenceBodySchema };
