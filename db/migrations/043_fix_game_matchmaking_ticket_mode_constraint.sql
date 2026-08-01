-- Update legacy matchmaking ticket modes and enforce strict matchmaking modes.
-- This migration converts old QUICK tickets to AUTO and replaces the legacy constraint.

ALTER TABLE game_matchmaking_ticket
  DROP CONSTRAINT IF EXISTS game_matchmaking_ticket_mode_check;

UPDATE game_matchmaking_ticket
SET mode = 'AUTO'
WHERE mode = 'QUICK';

ALTER TABLE game_matchmaking_ticket
  ADD CONSTRAINT game_matchmaking_ticket_mode_check CHECK (mode IN ('AUTO', 'CUSTOM', 'TOURNAMENT'));
