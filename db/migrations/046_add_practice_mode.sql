-- Add PRACTICE to the match-mode CHECK constraints so practice matches
-- (solo player vs bots, XP deducted but no rewards) can be persisted across
-- matchmaking tickets, match history, and the engine match header.

ALTER TABLE game_matchmaking_ticket
  DROP CONSTRAINT IF EXISTS game_matchmaking_ticket_mode_check;

ALTER TABLE game_matchmaking_ticket
  ADD CONSTRAINT game_matchmaking_ticket_mode_check CHECK (mode IN ('AUTO', 'CUSTOM', 'TOURNAMENT', 'PRACTICE'));

ALTER TABLE game_match
  DROP CONSTRAINT IF EXISTS game_match_mode_check;

ALTER TABLE game_match
  ADD CONSTRAINT game_match_mode_check CHECK (mode IN ('AUTO', 'CUSTOM', 'TOURNAMENT', 'PRACTICE'));

ALTER TABLE game_matches
  DROP CONSTRAINT IF EXISTS game_matches_mode_check;

ALTER TABLE game_matches
  ADD CONSTRAINT game_matches_mode_check CHECK (mode IN ('AUTO', 'CUSTOM', 'TOURNAMENT', 'PRACTICE'));
