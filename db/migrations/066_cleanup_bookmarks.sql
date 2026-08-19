-- 066_cleanup_bookmarks.sql

BEGIN;

-- Drop old check constraint on source_type
ALTER TABLE bookmark DROP CONSTRAINT IF EXISTS bookmark_source_type_check;

-- Migrate any data that was inserted into item_id/item_type back into source_id/source_type
UPDATE bookmark
SET source_id = item_id,
    source_type = item_type
WHERE item_id IS NOT NULL;

-- Make source_id and source_type NOT NULL
ALTER TABLE bookmark ALTER COLUMN source_id SET NOT NULL;
ALTER TABLE bookmark ALTER COLUMN source_type SET NOT NULL;

-- Re-add check constraint on source_type with all types
ALTER TABLE bookmark
  ADD CONSTRAINT bookmark_source_type_check
  CHECK (source_type IN ('post', 'profile', 'community', 'comment', 'game', 'event'));

-- Drop constraints related to item_type/item_id
ALTER TABLE bookmark DROP CONSTRAINT IF EXISTS bookmark_user_item_unique;
ALTER TABLE bookmark DROP CONSTRAINT IF EXISTS bookmark_item_type_check;
DROP INDEX IF EXISTS idx_bookmark_user_type;

-- Recreate unique constraint using source_id/source_type
ALTER TABLE bookmark DROP CONSTRAINT IF EXISTS bookmark_user_source_unique;
ALTER TABLE bookmark
  ADD CONSTRAINT bookmark_user_source_unique UNIQUE (user_id, source_type, source_id);

-- Recreate index using source_id/source_type
CREATE INDEX IF NOT EXISTS idx_bookmark_user_source
  ON bookmark (user_id, source_type, created_at DESC);

-- Drop the redundant columns (post_id, item_id, item_type)
ALTER TABLE bookmark 
DROP COLUMN IF EXISTS post_id,
DROP COLUMN IF EXISTS item_id,
DROP COLUMN IF EXISTS item_type;

COMMIT;
