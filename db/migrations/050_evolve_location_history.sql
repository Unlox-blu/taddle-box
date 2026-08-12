-- 050: Location telemetry — rename + evolve into append-only history.
--
-- There are TWO distinct location concepts in this app. Future devs, please
-- keep them separate:
--
--   1. DECLARED LOCATION  → users.location / users.latitude / users.longitude
--      User-entered at signup and shown on the profile. A profile attribute.
--      NEVER overwrite these with device GPS data.
--
--   2. CAPTURED LOCATION HISTORY → location_history (this table)
--      Device GPS telemetry captured when the app foregrounds (only if the
--      user granted location permission). Append-only: every capture is a row.
--      Latest position per user: SELECT DISTINCT ON (user_id) ... ORDER BY
--      user_id, captured_at DESC.
--
-- This migration converts the previous 1-row-per-user `user_locations` table
-- into a true history table and carries over any existing last-known rows.

CREATE TABLE IF NOT EXISTS location_history (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lat         DOUBLE PRECISION NOT NULL,
  lng         DOUBLE PRECISION NOT NULL,
  accuracy    DOUBLE PRECISION,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- History reads are always "latest N for a user" → user_id first, time second.
CREATE INDEX IF NOT EXISTS idx_location_history_user_captured
  ON location_history (user_id, captured_at DESC);

-- Carry over last-known positions from the old table, then drop it.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_locations') THEN
    INSERT INTO location_history (user_id, lat, lng, accuracy, captured_at)
    SELECT user_id, lat, lng, accuracy, captured_at
    FROM user_locations;
    DROP TABLE user_locations;
  END IF;
END $$;

-- Document both concepts at the schema level so the distinction survives.
COMMENT ON TABLE location_history IS
  'Captured device GPS telemetry (permission-gated, appended on app foreground). '
  'Distinct from the declared profile location in users.location.';
COMMENT ON COLUMN users.location IS
  'DECLARED profile location (user-entered at signup, shown on profile). '
  'Distinct from device GPS telemetry in location_history.';
COMMENT ON COLUMN users.latitude IS
  'DECLARED profile coordinates (user-entered at signup). Never overwritten by '
  'device GPS telemetry.';
COMMENT ON COLUMN users.longitude IS
  'DECLARED profile coordinates (user-entered at signup). Never overwritten by '
  'device GPS telemetry.';
