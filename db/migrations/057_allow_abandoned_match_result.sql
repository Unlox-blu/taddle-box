-- Allow marking game_match rows ABANDONED so the expired-match sweep can
-- clean up matches created by matchmaking that the user never entered
-- (ticket still MATCHED, match still live, older than the 10-minute
-- reconnect-replay freshness window).

ALTER TABLE game_match
  DROP CONSTRAINT IF EXISTS game_match_result_check;

ALTER TABLE game_match
  ADD CONSTRAINT game_match_result_check
  CHECK (result IN ('WIN', 'LOSS', 'DRAW', 'ABANDONED'));
