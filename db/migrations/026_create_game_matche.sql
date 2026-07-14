CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS game_match (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL
                REFERENCES users(id) ON DELETE CASCADE,
  game_id       UUID NOT NULL
                REFERENCES game(id) ON DELETE CASCADE,
  mode          VARCHAR(20) NOT NULL
                CHECK (mode IN ('BOT', 'QUICK', 'TOURNAMENT', 'CUSTOM')),
  result        VARCHAR(10)
                CHECK (result IN ('WIN', 'LOSS', 'DRAW')),
  score         INTEGER NOT NULL DEFAULT 0,
  duration      INTEGER NOT NULL DEFAULT 0, 
  xp_earned     INTEGER NOT NULL DEFAULT 0,
  category      VARCHAR(50),
  difficulty    VARCHAR(20)
                CHECK (difficulty IN ('easy', 'medium', 'hard')),
  metadata      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

