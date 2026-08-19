-- Migration 065: Future-proof bookmarks
-- Adds item_type + item_id to support bookmarking profiles, communities,
-- and any future entity type (comments, games, events, etc.).
-- Existing post bookmarks are migrated automatically.

BEGIN;

-- 1. Add new columns (nullable initially for the backfill)
ALTER TABLE bookmark
  ADD COLUMN IF NOT EXISTS item_type VARCHAR(30) DEFAULT 'post',
  ADD COLUMN IF NOT EXISTS item_id   UUID;

-- 2. Backfill item_id from post_id for existing rows
UPDATE bookmark
SET    item_id = post_id
WHERE  item_id IS NULL AND post_id IS NOT NULL;

-- Delete orphaned legacy bookmarks that had no post_id
DELETE FROM bookmark WHERE item_id IS NULL;

-- 3. Make NOT NULL after backfill
ALTER TABLE bookmark ALTER COLUMN item_id   SET NOT NULL;
ALTER TABLE bookmark ALTER COLUMN item_type SET NOT NULL;

-- 4. Replace the composite primary key with item_type-aware unique constraint
--    Drop the old PK first (it was on user_id + post_id).
ALTER TABLE bookmark DROP CONSTRAINT IF EXISTS bookmark_pkey;

-- Unique constraint: one bookmark per user+type+id
ALTER TABLE bookmark
  ADD CONSTRAINT bookmark_user_item_unique UNIQUE (user_id, item_type, item_id);

-- 5. Add an index for the "get all bookmarks for user, paginated" query,
--    partitioned by item_type so the tab filter is efficient.
CREATE INDEX IF NOT EXISTS idx_bookmark_user_type
  ON bookmark (user_id, item_type, created_at DESC);

-- 6. Rename post_id → keep it as a legacy column (nullable) for backward compat
--    with any queries that still reference it. It's redundant with item_id
--    when item_type = 'post', but removing it would break the FK to posts.
--    We leave it in place and just stop requiring it.
ALTER TABLE bookmark ALTER COLUMN post_id DROP NOT NULL;

-- 7. Add a CHECK constraint so item_type is one of the known types.
--    Extend this list as new entity types are added.
ALTER TABLE bookmark
  ADD CONSTRAINT bookmark_item_type_check
  CHECK (item_type IN ('post', 'profile', 'community', 'comment', 'game', 'event'));

COMMIT;
