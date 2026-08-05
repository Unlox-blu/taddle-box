-- Fix runtime for tap-rush and memory-grid
UPDATE game
SET metadata = jsonb_set(metadata, '{runtime}', '"native"')
WHERE slug IN ('tap-rush', 'memory-grid');

-- NOTE: tournament seeding used to happen here; it now lives in exactly one
-- place — 047_create_tournament_seed_ssot.sql (one recurring daily tournament
-- per active game). No tournaments are inserted in this migration anymore.
