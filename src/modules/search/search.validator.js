'use strict';

const { z } = require('zod');


const searchQuerySchema = z.object({
  type: z.enum(['all', 'post', 'posts', 'people', 'communities', 'events', 'games']).default('posts').optional(),
  q: z.string().default('').optional(),
  query: z.string().default('').optional(),
  filter: z.string().default('').optional(),
  // Community-scoped search — a slug limits results to that community.
  community: z.string().optional(),
  // Author-scoped search — a username limits results to that user's posts.
  author: z.string().optional(),
  // Involvement dimension (authored | mentions | comments | reposts).
  involvement: z.string().optional(),
  // Hashtag-scoped search — comma-separated tags limit results to posts
  // carrying any of them.
  tag: z.string().optional(),
  // Bookmarks scope — restrict posts to the user's saved items.
  bookmarked: z.string().optional(),
  // Own-posts scope — restrict posts to the viewer's own content.
  mine: z.string().optional(),
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
