BEGIN;

ALTER TABLE game_sessions
    ADD COLUMN IF NOT EXISTS state_snapshot JSONB,
    ADD COLUMN IF NOT EXISTS snapshot_revision INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS current_revision INTEGER DEFAULT 0;

-- Backfill from game_matches (for matches that were migrated)
UPDATE game_sessions
SET state_snapshot = gm.state_snapshot,
    snapshot_revision = gm.snapshot_revision,
    current_revision = gm.current_revision
FROM game_matches gm
WHERE game_sessions.id = gm.id
  AND game_sessions.state_snapshot IS NULL;

COMMIT;
