-- Migration: Add updated_at to game_matches and game_commands
-- Date: 2026-08-24
-- Fixes: "column updated_at of relation game_matches does not exist"

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. game_matches — add updated_at for engine snapshot/event writes
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE game_matches
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Backfill existing rows so NOW() is not the only value
UPDATE game_matches SET updated_at = COALESCE(updated_at, NOW());

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. game_commands — add updated_at + give state_revision a default
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE game_commands
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE game_commands
    ALTER COLUMN state_revision SET DEFAULT 0;

COMMIT;
