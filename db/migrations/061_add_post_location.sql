-- Post location: posts can carry an optional place (lat / lon / place name)
-- surfaced in the card's rolling text. All columns are nullable — existing
-- posts and reposts simply have no location.
ALTER TABLE posts ADD COLUMN IF NOT EXISTS latitude  DOUBLE PRECISION;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS place     VARCHAR(255);
