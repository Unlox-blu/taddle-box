-- Migration: Enrich media table for clean media contract
-- Date: 2026-08-21
-- Run AFTER deploying code changes

BEGIN;

-- 1. Add preview_url column if not exists
ALTER TABLE media ADD COLUMN IF NOT EXISTS preview_url TEXT;

-- 2. Backfill preview_url from vimeo_thumbnail_url (videos get Vimeo poster)
--    For images, preview_url = cloudfront_url (same file serves as preview)
UPDATE media
SET preview_url = COALESCE(vimeo_thumbnail_url, cloudfront_url)
WHERE preview_url IS NULL;

-- 3. Verify
-- SELECT media_type, COUNT(*) as total,
--   COUNT(preview_url) as has_preview,
--   ROUND(100.0 * COUNT(preview_url) / COUNT(*), 1) as pct
-- FROM media GROUP BY media_type;

COMMIT;
