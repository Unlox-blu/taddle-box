'use strict';

const { z } = require('zod');


const searchQuerySchema = z.object({
  type: z.enum(['all', 'post', 'posts', 'people', 'communities', 'events', 'games']).default('posts').optional(),
  q: z.string().default('').optional(),
  query: z.string().default('').optional(),
  filter: z.string().default('').optional(),
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


module.exports = {
  searchQuerySchema,
};
