CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS game_tournament (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  game_id        UUID NOT NULL REFERENCES game(id) ON DELETE CASCADE,
  title          VARCHAR(140) NOT NULL,
  description    TEXT,
  entry_fee_xp   INTEGER NOT NULL DEFAULT 0 CHECK (entry_fee_xp >= 0),
  prize_xp       INTEGER NOT NULL DEFAULT 0 CHECK (prize_xp >= 0),
  max_players    INTEGER NOT NULL DEFAULT 128 CHECK (max_players > 1),
  starts_at      TIMESTAMPTZ NOT NULL,
  ends_at        TIMESTAMPTZ NOT NULL,
  status         VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
                 CHECK (status IN ('UPCOMING', 'ACTIVE', 'COMPLETED', 'CANCELLED')),
  metadata       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS game_tournament_entry (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tournament_id  UUID NOT NULL REFERENCES game_tournament(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status         VARCHAR(20) NOT NULL DEFAULT 'REGISTERED'
                 CHECK (status IN ('REGISTERED', 'PLAYED', 'CANCELLED')),
  match_id       UUID REFERENCES game_match(id) ON DELETE SET NULL,
  score          INTEGER NOT NULL DEFAULT 0,
  xp_earned      INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tournament_id, user_id)
);

CREATE TABLE IF NOT EXISTS game_matchmaking_ticket (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id           UUID NOT NULL REFERENCES game(id) ON DELETE CASCADE,
  tournament_id     UUID REFERENCES game_tournament(id) ON DELETE CASCADE,
  mode              VARCHAR(20) NOT NULL CHECK (mode IN ('AUTO', 'CUSTOM', 'TOURNAMENT')),
  status            VARCHAR(20) NOT NULL DEFAULT 'WAITING'
                    CHECK (status IN ('WAITING', 'MATCHED', 'CANCELLED', 'EXPIRED')),
  opponent_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  user_match_id     UUID REFERENCES game_match(id) ON DELETE SET NULL,
  opponent_match_id UUID REFERENCES game_match(id) ON DELETE SET NULL,
  match_group_id    UUID,
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  matched_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_game_matchmaking_waiting
  ON game_matchmaking_ticket (game_id, mode, tournament_id, created_at)
  WHERE status = 'WAITING';

CREATE UNIQUE INDEX IF NOT EXISTS idx_game_matchmaking_one_waiting_user
  ON game_matchmaking_ticket (user_id, game_id, mode, COALESCE(tournament_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE status = 'WAITING';

-- Tournament seeds live in ONE place only: 047_create_tournament_seed_ssot.sql
-- (one recurring daily tournament per active game). Anything inserted here
-- would duplicate those rows, so none are created in this migration.
