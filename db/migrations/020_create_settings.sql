CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS settings (
  user_id                   UUID REFERENCES users(id) ON DELETE CASCADE,
  theme                     VARCHAR(10) NOT NULL DEFAULT 'light'
                              CHECK (theme IN ('light', 'dark')),
  promotional_notification  BOOLEAN DEFAULT TRUE,
  system_notification       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(user_id)
)