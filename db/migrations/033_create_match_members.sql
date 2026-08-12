-- match_members ties users to a multiplayer match session
-- and stores the ws_token used to authenticate the game socket connection.

CREATE TABLE IF NOT EXISTS match_members (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id      UUID NOT NULL,           -- references the matchmaking group id (matchGroupId)
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ws_token      VARCHAR(64) NOT NULL,
  player_color  VARCHAR(30),             -- for color-coded games (ludo, etc.)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (match_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_match_members_match_id ON match_members(match_id);
CREATE INDEX IF NOT EXISTS idx_match_members_user_id ON match_members(user_id);

-- game_matches is the authoritative multiplayer match header row
CREATE TABLE IF NOT EXISTS game_matches (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id     UUID NOT NULL REFERENCES game(id) ON DELETE CASCADE,
  mode        VARCHAR(20) NOT NULL DEFAULT 'QUICK',
  status      VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
              CHECK (status IN ('ACTIVE', 'COMPLETED', 'CANCELLED')),
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_game_matches_game_id ON game_matches(game_id);
