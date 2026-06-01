'use strict';

const { z } = require('zod');
const { POST_TYPES, POST_STATUSES, VISIBILITIES } = require('../models/post.model');

const createPostSchema = z.object({
  title: z.string().min(1, 'Title is required for the post').max(300),
  content: z.string().max(10000).optional(),
  postType: z.enum(POST_TYPES).default('text'),
  communityId: z.string().uuid('Invalid community ID').optional(),
  tags: z.array(z.string().max(50)).max(10).default([]),
  category: z.array(z.string().max(50)).max(5).default([]),
  visibility: z.enum(VISIBILITIES).default('public'),
  status: z.enum(POST_STATUSES).default('published'),
  pollData: z.record(z.unknown()).optional(),
  linkData: z.record(z.unknown()).optional(),
}).refine((d) => d.content || d.title || d.pollData || d.linkData, {
  message: 'Post must have content, title, poll data, or link data',
});

// const updatePostSchema = createPostSchema.partial().omit({ postType: true, communityId: true });

const updatePostSchema = z.object({
  title: z.string().max(300).optional(),
  content: z.string().max(10000).optional(),
  tags: z.array(z.string().max(50)).max(10).optional(),
  category: z.array(z.string().max(50)).max(5).optional(),
  visibility: z.enum(VISIBILITIES).optional(),
  status: z.enum(POST_STATUSES).optional(),
  pollData: z.record(z.unknown()).optional(),
  linkData: z.record(z.unknown()).optional(),
});

module.exports = { createPostSchema, updatePostSchema };
