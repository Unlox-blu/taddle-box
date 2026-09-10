-- Migration: move per-game tips onto the game table (backend SSOT)
-- Date: 2026-09-09
-- Tips are a jsonb column on the game row itself — one fewer table/join,
-- returned directly by the games list and the startGameSession API for the
-- match-start screen pill.

BEGIN;

ALTER TABLE game
  ADD COLUMN IF NOT EXISTS tips JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Carry over any tips seeded into the (short-lived) game_tips table.
UPDATE game g
SET tips = sub.tip_list
FROM (
  SELECT t.game_id, jsonb_agg(t.tip ORDER BY t.sort_order) AS tip_list
  FROM game_tips t
  WHERE t.is_active
  GROUP BY t.game_id
) sub
WHERE g.id = sub.game_id
  AND g.tips = '[]'::jsonb;

DROP TABLE IF EXISTS game_tips;

COMMIT;
