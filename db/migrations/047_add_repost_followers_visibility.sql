-- Reposts: a post can reference the post it re-shares.
ALTER TABLE posts ADD COLUMN IF NOT EXISTS repost_of_id UUID REFERENCES posts(id) ON DELETE SET NULL;

-- Allow the new 'followers' visibility (private-account posts → approved followers).
ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_visibility_check;
ALTER TABLE posts
  ADD CONSTRAINT posts_visibility_check
  CHECK (visibility IN ('public', 'community_only', 'private', 'followers'));

-- Ensure settings toggles exist (added out-of-band in dev; guaranteed here for fresh DBs).
ALTER TABLE settings ADD COLUMN IF NOT EXISTS public_account          BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS activity_status         BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS allow_tagging           BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS show_on_leaderboard     BOOLEAN NOT NULL DEFAULT TRUE;
