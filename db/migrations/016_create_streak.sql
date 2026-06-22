CREATE TABLE IF NOT EXISTS streak (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  streak_count    INT NOT NULL DEFAULT 1 CHECK (streak_count >= 0),
  start_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date        DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);