'use strict';

const { z } = require('zod');
const { POST_STATUSES, VISIBILITIES } = require('./post.model');

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

const createPostSchema = z.object({
  title: z.string().min(1, 'Title is required for the post').max(300),
  content: z.string().max(10000).optional(),
  communityId: z.string().uuid('Invalid community ID').optional(),
  tags: z.preprocess(typeCheck ,z.array(z.string().max(50)).max(10).default([])),
  category: z.preprocess(typeCheck ,z.array(z.string().max(50)).max(5).default([])),
  visibility: z.enum(VISIBILITIES).default('public'),
  status: z.enum(POST_STATUSES).default('published'),
  pollData: z.record(z.unknown()).optional(),
  linkData: z.record(z.unknown()).optional(),
  media: z.array(z.record(z.unknown())).max(5, "Maximum 5 media files allowed").optional(),
}).refine((d) => d.content || d.title || d.pollData || d.linkData, {
  message: 'Post must have content, title, poll data, or link data',
});

// const updatePostSchema = createPostSchema.partial().omit({ postType: true, communityId: true });

const updatePostSchema = z.object({
  title: z.string().max(300).optional(),
  content: z.string().max(10000).optional(),
  tags: z.preprocess(typeCheck ,z.array(z.string().max(50)).max(10).default([])),
  category: z.preprocess(typeCheck ,z.array(z.string().max(50)).max(5).default([])),
  visibility: z.enum(VISIBILITIES).optional(),
  status: z.enum(POST_STATUSES).optional(),
  pollData: z.record(z.unknown()).optional(),
  linkData: z.record(z.unknown()).optional(),
});

const postIdParamsSchema = z.object({
  postId: z.string().uuid({ message: 'Invalid post ID format' })
}).strict();

const authorIdParamsSchema = z.object({
  authorId: z.string().uuid({ message: 'Invalid author ID format' })
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
}).strict();

module.exports = { createPostSchema, updatePostSchema, postIdParamsSchema, authorIdParamsSchema, paginationQuerySchema };
