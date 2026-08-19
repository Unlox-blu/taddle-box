'use strict';

const { z } = require('zod');
const { ITEM_TYPES } = require('./bookmark.model');

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

  type: z.enum(ITEM_TYPES).optional().default('post'),
}).strict();

const bookmarksQuerySchema = z.object({
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

  type: z.string().optional().default('all'),
}).strict();

const toggleBookmarkSchema = z.object({
  itemType: z.enum(ITEM_TYPES, {
    errorMap: () => ({ message: `itemType must be one of: ${ITEM_TYPES.join(', ')}` }),
  }),
  itemId: z.string().uuid('itemId must be a valid UUID'),
}).strict();

const checkBookmarkQuerySchema = z.object({
  type: z.enum(ITEM_TYPES),
  itemId: z.string().uuid('itemId must be a valid UUID'),
}).strict();

module.exports = {
  paginationQuerySchema,
  bookmarksQuerySchema,
  toggleBookmarkSchema,
  checkBookmarkQuerySchema,
};
