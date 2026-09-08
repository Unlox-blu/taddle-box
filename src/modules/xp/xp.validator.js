'use strict';

const { z } = require('zod');


const claimXPSchema = z.object({
  event: z.enum(['daily_login', 'post_view', 'event_join', 'community_join'], { errorMap: () => ({ message: 'Invalid claim event' }) }),
  payload: z.record(z.string(), z.unknown()).optional(),
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

  // Wallet search — server-side filter over the full XP history.
  q: z.string().optional(),
  // TIME window + SORT mirror global search (see wallet search scope).
  time: z.enum(['recent', 'past_week', 'past_month', 'past_year', 'all_time']).optional(),
  sort: z.string().max(20).optional(),
}).strict();


module.exports = { paginationQuerySchema, claimXPSchema };