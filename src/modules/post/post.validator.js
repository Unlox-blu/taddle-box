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
  // Optional place tag: { lat, lon, place } captured from the composer's
  // location picker and shown in the post card's rolling text.
  location: z.preprocess(typeCheck ,z.object({
    lat: z.number().min(-90).max(90, 'Latitude must be between -90 and 90'),
    lon: z.number().min(-180).max(180, 'Longitude must be between -180 and 180'),
    place: z.string().max(255).optional(),
  }).optional()),
  // Confirmed @mention ids from the composer — used to notify mentioned users
  // (the content itself carries the structured {@}[name](id) syntax, which the
  // plain-text @handle scan below also covers as a fallback).
  mentions: z.preprocess(typeCheck ,z.array(z.string().uuid('Invalid mention id')).max(20).default([])),
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

// Body for POST /:postId/poll/vote — which option the user is voting for.
// The option index is validated against the poll's option count server-side
// (the poll itself may change between validation and execution).
const pollVoteSchema = z.object({
  optionIndex: z.number().int({ message: 'Option index must be an integer' }).min(0, 'Invalid poll option')
}).strict();

const authorIdParamsSchema = z.object({
  authorId: z.string().uuid({ message: 'Invalid author ID format' })
}).strict();

// Query for GET /:postId/poll/voters — which option's voters to list.
const pollVotersQuerySchema = z.object({
  option: z.coerce
    .number({ invalid_type_error: 'Option must be a number' })
    .int({ message: 'Option must be an integer' })
    .min(0, 'Invalid poll option'),
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

  // Profile feed filter: 'all' (default) | 'posts' (originals only) | 'reposts'.
  type: z.enum(['all', 'posts', 'reposts']).optional().default('all'),
}).strict();

const getPostQuerySchema = z.object({
  via_repost: z.string().uuid({ message: 'Invalid via_repost ID format' }).optional()
}).strict();

module.exports = { createPostSchema, updatePostSchema, postIdParamsSchema, authorIdParamsSchema, paginationQuerySchema, getPostQuerySchema, pollVoteSchema, pollVotersQuerySchema };
