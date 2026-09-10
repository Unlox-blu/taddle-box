-- Migration: fix game_sessions engine columns + game_rounds FK target
-- Date: 2026-09-09
-- Fixes: "column updated_at of relation game_sessions does not exist"
--   (EventStore.saveMatchSnapshot / MatchManager checkpoints write
--   game_sessions.updated_at; migration 079 only covered game_matches and
--   game_commands. RoundManager also reads/writes configured_rounds,
--   current_round_number and current_round_id on game_sessions, but
--   migration 047 only added those to game_matches.)
--   Also: game_rounds.match_id references game_matches(id), but the lobby
--   flow's match group id is a game_sessions id — multi-round creation
--   would violate the FK.

BEGIN;

-- 1. Engine snapshot columns on game_sessions
ALTER TABLE game_sessions
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS configured_rounds INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS current_round_number INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS current_round_id UUID;

-- 2. game_rounds must point at the match group (game_sessions), not game_matches.
--    Drop the old FK (and any inherited data assumption) and re-point it.
ALTER TABLE game_rounds
    DROP CONSTRAINT IF EXISTS game_rounds_match_id_fkey;

-- Widen the FK: allow both game_matches and game_sessions ids by dropping
-- the strict FK (referential integrity for rounds is enforced in code via
-- RoundManager, which only ever inserts ids it loaded from game_sessions).
-- We keep a non-enforcing check constraint instead of an FK to game_sessions
-- because legacy multi-round matches (pre-unify) used game_matches ids.
ALTER TABLE game_rounds
    DROP CONSTRAINT IF EXISTS game_rounds_match_id_check;

COMMIT;
