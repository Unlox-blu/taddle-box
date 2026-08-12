'use strict';

const { z } = require('zod');


// The unified search schema — the ONLY search shape the API accepts now.
// URL: search/?q=&sort=&filter=&type=&bookmarked=&page=&limit=
// The TIME window is a BARE token in the URL (no `time=` key):
// search/?sort=relevance&all_time
const searchQuerySchema = z.object({
  // 'all' (or empty) → the mixed All view; otherwise one of the server's
  // result pills (posts | polls | comments | media | text | people |
  // communities | events | games). 'all' is what the pills return now.
  type: z
    .union([
      z.enum([
        'all',
        'posts',
        'polls',
        'comments',
        'media',
        'text',
        'people',
        'communities',
        'events',
        'games',
      ]),
      z.literal(''),
    ])
    .default('')
    .optional(),
  q: z.string().default('').optional(),
  // One comma-separated list of scoped tokens — c/<slug> for communities,
  // @<user> for people, #<tag> (or a bare word) for hashtags.
  filter: z.string().default('').optional(),
  // Sort selector: relevance | top | latest | hot (trending recently).
  // Enforced strictly — no fallback sort on the service side.
  sort: z.enum(['relevance', 'top', 'latest', 'hot']).default('relevance').optional(),
  // TIME window — carried ONLY as a bare token in the URL:
  // `sort=relevance&all_time` (the `time=` key is deliberately NOT accepted).
  // The bare keys below are folded into `time` in the transform.
  recent: z.string().optional(),
  past_week: z.string().optional(),
  past_month: z.string().optional(),
  past_year: z.string().optional(),
  all_time: z.string().optional(),
  // Bookmarks scope — restrict results to the user's saved content.
  bookmarked: z.string().optional(),
  scope: z.string().optional(),
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
})
  .strict()
  // Fold the bare time-window token (e.g. `&all_time`) into the `time` param
  // so the service always reads one value. With `time=` removed from the
  // schema, the strict parse rejects the old explicit form.
  .transform((q) => {
    const bare = ['recent', 'past_week', 'past_month', 'past_year', 'all_time']
      .find((k) => q[k] !== undefined);
    if (!bare) return q;
    const { [bare]: _drop, ...rest } = q;
    return { ...rest, time: bare };
  });


module.exports = {
  searchQuerySchema,
};
