'use strict';

const { z } = require('zod');

const createCommentSchema = z.object({
  postId: z.string().uuid('Invalid post ID'),
  content: z.string().min(1, 'Comment cannot be empty').max(5000),
  parentId: z.string().uuid('Invalid parent comment ID').optional(),
}).strict();

const updateCommentSchema = z.object({
  content: z.string().min(1).max(5000),
}).strict();

module.exports = { createCommentSchema, updateCommentSchema };
