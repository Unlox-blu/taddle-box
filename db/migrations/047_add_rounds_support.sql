-- Multi-round match support
-- Adds round tracking to matches and creates per-round state table.

-- 1. Add round columns to game_matches
ALTER TABLE game_matches
  ADD COLUMN IF NOT EXISTS configured_rounds INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS current_round_number INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS current_round_id UUID;

-- 2. Create game_rounds table
CREATE TABLE IF NOT EXISTS game_rounds (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id               UUID NOT NULL REFERENCES game_matches(id) ON DELETE CASCADE,
  round_number           INTEGER NOT NULL CHECK (round_number >= 1),
  status                 TEXT NOT NULL DEFAULT 'WAITING'
    CHECK (status IN ('WAITING', 'LOADING', 'READY', 'ACTIVE', 'FINISHED')),
  config_snapshot        JSONB DEFAULT '{}',
  asset_set_id           TEXT,
  asset_manifest_version INTEGER DEFAULT 1,
  result_snapshot        JSONB DEFAULT '{}',
  state_snapshot         JSONB DEFAULT '{}',
  state_revision         INTEGER DEFAULT 0 CHECK (state_revision >= 0),
  started_at             TIMESTAMPTZ,
  finished_at            TIMESTAMPTZ,
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(match_id, round_number)
);

-- 3. Index for fast lookups by match
CREATE INDEX IF NOT EXISTS idx_game_rounds_match_id ON game_rounds(match_id);
CREATE INDEX IF NOT EXISTS idx_game_rounds_status ON game_rounds(status);

-- 4. Backfill existing matches: 1 round, round 1 active
UPDATE game_matches
SET configured_rounds = 1,
    current_round_number = 1
WHERE configured_rounds IS NULL;
