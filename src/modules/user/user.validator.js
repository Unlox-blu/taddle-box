'use strict';

const { z } = require('zod');

const usernameRules = z
  .string()
  .min(3, 'Username must be at least 3 characters')
  .max(30, 'Username must be at most 30 characters')
  .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers and underscores');

const transformToLowerCase = (val) => typeof val === 'string' ? val.trim().toLowerCase() : val

// Every editable profile field the users table exposes — matches the signup
// form so users can change anything they set at registration.
const updateProfileSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  bio: z.string().max(500, 'Bio cannot exceed 500 characters').optional(),
  websiteUrl: z.string().url('Invalid URL').optional().or(z.literal('')),
  location: z.string().max(255, 'Location is too long').optional().or(z.literal('')),
  organization: z.string().max(255, 'Organization is too long').optional().or(z.literal('')),
  // Empty string is an explicit "clear this field" — the repository maps it
  // to NULL so a cleared occupation/gender actually persists.
  occupation: z.enum(['Student', 'Working Professional', 'Self-employed / Freelancer', 'Other'], { errorMap: () => ({ message: 'Invalid occupation' }) }).optional().or(z.literal('')),
  gender: z.enum(['male', 'female', 'other'], { errorMap: () => ({ message: 'Invalid gender' }) }).optional().or(z.literal('')),
  // 'YYYY-MM-DD' — validated as a REAL calendar date (2023-13-45 or 2023-02-31
  // must be rejected here, not left for the DB DATE cast to 500 on).
  dateOfBirth: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date of birth')
    .refine((s) => {
      const [y, m, d] = s.split('-').map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d));
      return (
        dt.getUTCFullYear() === y &&
        dt.getUTCMonth() === m - 1 &&
        dt.getUTCDate() === d
      );
    }, 'Invalid date of birth')
    .optional(),
  interests: z.array(z.string().max(60, 'Interest is too long')).max(30, 'Too many interests').optional(),
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

const removePinVerifySchema = z.object({
  password: z.string().min(1, 'Password is required'),
  emailOtp: z.string().length(6, 'Email OTP must be 6 digits').regex(/^[0-9]+$/, 'Email OTP must be numeric'),
  phoneOtp: z.string().length(6, 'Phone OTP must be 6 digits').regex(/^[0-9]+$/, 'Phone OTP must be numeric').optional(),
}).strict();

module.exports = { updateProfileSchema, updateUsernameSchema, updatePrivacySchema, updateBannerSchema, updateAvatarSchema, usernameSchema, userIdSchema, followerIdSchema, locationBodySchema, removePinVerifySchema };
