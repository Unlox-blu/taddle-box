-- ============================================================
-- Final content session schema (polymorphic items)
-- Run: psql -f migrations/20260902_content_sessions_final.sql
-- ============================================================

-- Drop old tables if they exist
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'reel_session_posts') THEN
    DROP TABLE reel_session_posts CASCADE;
  END IF;
  IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'feed_session_posts') THEN
    DROP TABLE feed_session_posts CASCADE;
  END IF;
  IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'content_session_posts') THEN
    DROP TABLE content_session_posts CASCADE;
  END IF;
  IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'reel_sessions') THEN
    DROP TABLE reel_sessions CASCADE;
  END IF;
  IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'feed_sessions') THEN
    DROP TABLE feed_sessions CASCADE;
  END IF;
END $$;

-- Content sessions
CREATE TABLE IF NOT EXISTS content_sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_context    TEXT NOT NULL DEFAULT 'home',
  source_context_id TEXT,
  presentation      TEXT NOT NULL DEFAULT 'feed',
  latest_content_at TIMESTAMPTZ,
  total_content     INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at        TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '1 hour')
);

-- Content session items (polymorphic)
CREATE TABLE IF NOT EXISTS content_session_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID NOT NULL REFERENCES content_sessions(id) ON DELETE CASCADE,
  content_type  TEXT NOT NULL,
  content_id    UUID NOT NULL,
  position      INTEGER NOT NULL CHECK (position >= 0),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(session_id, position),
  UNIQUE(session_id, content_type, content_id)
);

-- Indexes
-- UNIQUE(session_id, position) already creates a B-tree index for pagination queries
-- Add indexes for cleanup and user lookups
CREATE INDEX IF NOT EXISTS idx_content_sessions_user
  ON content_sessions(user_id);

CREATE INDEX IF NOT EXISTS idx_content_sessions_expires
  ON content_sessions(expires_at);

CREATE INDEX IF NOT EXISTS idx_content_session_items_content
  ON content_session_items(content_type, content_id);
