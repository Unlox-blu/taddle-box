CREATE TABLE IF NOT EXISTS xp (
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  xp              INT NOT NULL DEFAULT 1 CHECK (xp >= 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id)
);