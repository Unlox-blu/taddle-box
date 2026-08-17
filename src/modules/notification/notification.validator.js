'use strict';

const { z } = require('zod');
const config = require('../../config/app.config')

const notificationIdParamsSchema = z.object({
  notificationId: z.string().uuid({ message: 'Invalid notification ID format' })
}).strict();

const paginationQuerySchema = z.object({
  // Converts string to number, ensures it is a positive integer, defaults to 1 if missing
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

  type: z.string().max(100).optional(),
  unread: z.enum(['true', 'false']).optional(),

  // Server-side search (mirrors the global search params): q is the free-text
  // term, sort/time are accepted for parity (notifications are always
  // newest-first, but the time window narrows by created_at).
  q: z.string().max(200).optional(),
  sort: z.string().max(20).optional(),
  time: z.enum(['recent', 'past_week', 'past_month', 'past_year', 'all_time']).optional(),
}).strict();


module.exports = {
  paginationQuerySchema, notificationIdParamsSchema,
};
