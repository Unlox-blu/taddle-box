-- ============================================================
-- SSOT Migration: ensure preview_url exists for all media rows
-- Run: psql -f migrations/20260822_ssot_media_backfill.sql
-- ============================================================

-- 1. Add preview_url column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'media' AND column_name = 'preview_url'
  ) THEN
    ALTER TABLE media ADD COLUMN preview_url TEXT;
  END IF;
END $$;

-- 2. Backfill preview_url for videos (use vimeo_thumbnail_url if available, else cloudfront_url)
UPDATE media
SET preview_url = COALESCE(vimeo_thumbnail_url, cloudfront_url)
WHERE media_type = 'video' AND preview_url IS NULL;

-- 3. Backfill preview_url for images (use cloudfront_url — the image IS the preview)
UPDATE media
SET preview_url = cloudfront_url
WHERE media_type = 'image' AND preview_url IS NULL;

-- 4. Backfill preview_url for audio (use cloudfront_url as cover fallback)
UPDATE media
SET preview_url = cloudfront_url
WHERE media_type = 'audio' AND preview_url IS NULL;

-- 5. Verify: count rows still missing preview_url
SELECT media_type, COUNT(*) AS missing_count
FROM media
WHERE preview_url IS NULL AND deleted_at IS NULL
GROUP BY media_type;
