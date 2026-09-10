-- Migration: per-game tips (backend SSOT for the match-start screen pill)
-- Date: 2026-09-09
-- The match-start screen's rotating tips used to be hardcoded in the app
-- bundle. Tips are content — they must be server-driven so they can be
-- updated/removed without an app release.

BEGIN;

CREATE TABLE IF NOT EXISTS game_tips (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id    UUID NOT NULL REFERENCES game(id) ON DELETE CASCADE,
  tip        TEXT NOT NULL,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One tip per game only appears once — dedupe guard for admin edits/seeds
CREATE UNIQUE INDEX IF NOT EXISTS game_tips_game_tip_key ON game_tips (game_id, md5(tip));
CREATE INDEX IF NOT EXISTS game_tips_game_active_idx ON game_tips (game_id, sort_order) WHERE is_active;

COMMIT;
