CREATE TABLE IF NOT EXISTS game_lobby (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  game_id           UUID NOT NULL REFERENCES game(id) ON DELETE CASCADE,
  status            VARCHAR(20) NOT NULL DEFAULT 'WAITING'
                    CHECK (status IN ('WAITING', 'LOCKED', 'READY', 'MATCHED', 'COMPLETED', 'CANCELLED')),
  max_players       INTEGER NOT NULL DEFAULT 2,
  current_players   INTEGER NOT NULL DEFAULT 0,
  host_user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  settings          JSONB NOT NULL DEFAULT '{}'::jsonb,
  expires_at        TIMESTAMPTZ,
  started_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE game_matchmaking_ticket 
  ADD COLUMN IF NOT EXISTS lobby_id UUID REFERENCES game_lobby(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_game_lobby_status
  ON game_lobby (game_id, status, current_players);
