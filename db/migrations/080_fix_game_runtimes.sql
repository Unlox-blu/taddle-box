-- Migration: Fix game runtime values to match client-side GameRuntimeRegistry
-- Date: 2026-08-24
-- The initial backfill used per-game runtimes (chess-v1, snake-ladder-v1, scribble-v1)
-- but the client registry maps ALL board games to 'board-v1', drawing to 'drawing-v1'.

BEGIN;

UPDATE game SET runtime = 'board-v1'     WHERE slug = 'chess';
UPDATE game SET runtime = 'board-v1'     WHERE slug = 'snake-ladder';
UPDATE game SET runtime = 'drawing-v1'   WHERE slug = 'scribble';

-- Verify no stale runtimes remain
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM game
        WHERE runtime NOT IN ('board-v1', 'reaction-v1', 'word-v1', 'drawing-v1', 'memory-v1')
    ) THEN
        RAISE WARNING 'Some games have unmapped runtime values — check game table';
    END IF;
END $$;

COMMIT;
