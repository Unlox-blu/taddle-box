-- Migration: SSOT rename — media.cloudfront_url → media_url
-- Date: 2026-09-09
-- The media table stores images, videos and audio. `cloudfront_url` named the
-- column after a specific CDN/vendor even though the value is just the stored
-- media URL (S3 key mirrored at the CLOUDFRONT_DOMAIN base). Renaming to the
-- vendor-neutral SSOT name `media_url`. No alias column is kept: every reader
-- is updated in the same change.

BEGIN;

-- Guarded rename: only run when the old column exists and the new one doesn't.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'media' AND column_name = 'cloudfront_url'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'media' AND column_name = 'media_url'
  ) THEN
    ALTER TABLE media RENAME COLUMN cloudfront_url TO media_url;
  END IF;
END $$;

COMMIT;
