-- Alter status constraint to include TIMED_OUT
ALTER TABLE game_lobby DROP CONSTRAINT IF EXISTS game_lobby_status_check;
ALTER TABLE game_lobby ADD CONSTRAINT game_lobby_status_check 
  CHECK (status IN ('WAITING', 'LOCKED', 'TIMED_OUT', 'READY', 'MATCHED', 'COMPLETED', 'CANCELLED'));

-- Add new columns
ALTER TABLE game_lobby 
  ADD COLUMN IF NOT EXISTS timeout_extensions INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS visibility VARCHAR(20) NOT NULL DEFAULT 'PUBLIC' CHECK (visibility IN ('PUBLIC', 'PRIVATE')),
  ADD COLUMN IF NOT EXISTS invite_code VARCHAR(20) UNIQUE;

-- Create index on visibility
CREATE INDEX IF NOT EXISTS idx_game_lobby_visibility ON game_lobby (visibility);
