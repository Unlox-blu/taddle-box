'use strict';

const { z } = require('zod');


// The unified search schema — the ONLY search shape the API accepts now.
// URL: search/?q=&sort=&filter=&type=&bookmarked=&page=&limit=
// TIME window is the explicit `time=` param:
// search/?sort=relevance&time=all_time
// (the legacy bare-token form `&all_time` is still accepted and folded into
// `time` in the transform below, so old clients keep working).
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
        // Notification buckets (only valid with notified=1).
        'likes',
        'follows',
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
  // TIME window — the explicit `time=` param (recent | past_week | past_month
  // | past_year | all_time). The bare-token keys below are legacy: they're
  // still accepted and folded into `time` in the transform.
  time: z
    .enum(['recent', 'past_week', 'past_month', 'past_year', 'all_time'])
    .optional(),
  recent: z.string().optional(),
  past_week: z.string().optional(),
  past_month: z.string().optional(),
  past_year: z.string().optional(),
  all_time: z.string().optional(),
  // Bookmarks scope — restrict results to the user's saved content.
  bookmarked: z.string().optional(),
  // Notifications scope — restrict results to the user's notifications
  // (mirrors bookmarked=1; the result groups become likes/comments/follows).
  notified: z.string().optional(),
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
  // Resolve the TIME window to one value: the explicit `time=` wins (any
  // legacy bare token is dropped); otherwise the legacy bare token (e.g.
  // `&all_time`) is folded in as a fallback.
  .transform((q) => {
    const BARE_KEYS = ['recent', 'past_week', 'past_month', 'past_year', 'all_time'];
    if (q.time) {
      const rest = { ...q };
      for (const k of BARE_KEYS) delete rest[k];
      return rest;
    }
    const bare = BARE_KEYS.find((k) => q[k] !== undefined);
    if (!bare) return q;
    const { [bare]: _drop, ...rest } = q;
    return { ...rest, time: bare };
  });


module.exports = {
  searchQuerySchema,
};
