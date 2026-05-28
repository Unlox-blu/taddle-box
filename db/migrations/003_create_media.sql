-- 003_create_media.sql
CREATE TABLE IF NOT EXISTS media (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  uploader_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  media_type          VARCHAR(20) NOT NULL CHECK (media_type IN ('image','video','audio','document')),
  s3_key              TEXT,
  cloudfront_url      TEXT,
  vimeo_uri           TEXT,
  vimeo_player_url    TEXT,
  vimeo_thumbnail_url TEXT,
  mime_type           VARCHAR(100),
  size_bytes          BIGINT,
  width               INTEGER,
  height              INTEGER,
  duration_seconds    INTEGER,
  processing_status   VARCHAR(20) NOT NULL DEFAULT 'pending'
                        CHECK (processing_status IN ('pending','processing','ready','error','timeout')),
  deleted_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
