-- Unique-per-user post views: a (post_id, user_id) pair may only ever appear
-- once, so recordView can increment views_count exactly once per viewer.
-- Partial (user_id IS NOT NULL) keeps anonymous rows — which have no identity
-- to dedupe against — from colliding with each other.
CREATE UNIQUE INDEX IF NOT EXISTS uq_post_views_user
  ON post_views (post_id, user_id)
  WHERE user_id IS NOT NULL;
