CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Last-known device location, captured only when the user granted location
-- permission. One row per user (upsert on each capture).
CREATE TABLE IF NOT EXISTS user_locations (
  user_id     UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  lat         DOUBLE PRECISION NOT NULL,
  lng         DOUBLE PRECISION NOT NULL,
  accuracy    DOUBLE PRECISION,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_locations_captured_at ON user_locations (captured_at DESC);
