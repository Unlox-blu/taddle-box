BEGIN;

-- Permanently drop the legacy match members roster
DROP TABLE IF EXISTS match_members CASCADE;

-- Permanently drop the legacy game matches table
DROP TABLE IF EXISTS game_matches CASCADE;

-- We are NOT dropping game_matchmaking_ticket as it still serves the matchmaking queue

COMMIT;
