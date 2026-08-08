-- 051: Naming alignment — "Profile location" (declared) vs "Geo location" (captured).
--
-- The two location concepts are now officially named:
--
--   1. PROFILE LOCATION → users.location / users.latitude / users.longitude
--      Free-text place + coordinates entered at signup, shown on the profile.
--      A profile attribute. NEVER overwritten by device GPS.
--
--   2. GEO LOCATION → location_history (this table)
--      Device GPS telemetry captured on app foreground (permission-gated).
--      Append-only; every capture is a row. New `place` column holds a
--      free-text reverse-geocoded place name ("Bengaluru, Karnataka") in
--      addition to raw lat/lng.
--
-- This migration only realigns comments and adds the free-text column.

ALTER TABLE location_history ADD COLUMN IF NOT EXISTS place VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_location_history_place ON location_history (place);

COMMENT ON TABLE location_history IS
  'GEO location — captured device GPS telemetry (permission-gated, appended on '
  'app foreground) with optional free-text place name. Distinct from the '
  'declared PROFILE location in users.location.';
COMMENT ON COLUMN location_history.place IS
  'Free-text reverse-geocoded place name for this capture (e.g. "Bengaluru, '
  'Karnataka"). Optional — null when reverse geocoding failed or was skipped.';
COMMENT ON COLUMN users.location IS
  'PROFILE location — free-text place name the user declared at signup, shown '
  'on their profile. Distinct from GEO location telemetry in location_history.';
COMMENT ON COLUMN users.latitude IS
  'PROFILE coordinates (declared at signup, shown on profile). Never '
  'overwritten by device GPS telemetry.';
COMMENT ON COLUMN users.longitude IS
  'PROFILE coordinates (declared at signup, shown on profile). Never '
  'overwritten by device GPS telemetry.';
