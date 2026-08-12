-- Update legacy game_match modes and enforce strict matchmaking modes.
-- This migration converts old BOT/QUICK match records to the new mode set.

ALTER TABLE game_match
  DROP CONSTRAINT IF EXISTS game_match_mode_check;

UPDATE game_match
SET mode = 'AUTO'
WHERE mode = 'QUICK';

UPDATE game_match
SET mode = 'CUSTOM'
WHERE mode = 'BOT';

ALTER TABLE game_match
  ADD CONSTRAINT game_match_mode_check CHECK (mode IN ('AUTO', 'CUSTOM', 'TOURNAMENT'));
