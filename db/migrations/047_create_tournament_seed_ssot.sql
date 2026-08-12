-- ─────────────────────────────────────────────────────────────────────────────
-- 047 — TOURNAMENT SEEDING SSOT
--
-- Every tournament seed in the codebase lives HERE: exactly ONE recurring
-- daily tournament per active game. Legacy seed rows from 031 (the two
-- fixed-ID tournaments) and 040 (per-game daily sprints) are purged first,
-- so a game can never end up with duplicate tournaments after re-runs.
--
-- Also re-asserts the native runtime for tap-rush / memory-grid. Migration
-- 040 set it once, but those game rows have been re-seeded afterwards in
-- dev, leaving a stale `html5_webview` flag that stops the app from
-- mounting the native game component (games that "never join").
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Re-assert native runtime for the two engine games.
UPDATE game
SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{runtime}', '"native"')
WHERE slug IN ('tap-rush', 'memory-grid');

-- 2. Purge legacy seeded tournaments: the two fixed-ID tournaments from 031
--    and every recurring seed created by 040. User-created tournaments
--    (metadata->>'type' IS DISTINCT FROM 'recurring') are left untouched.
--    NOTE: this intentionally wipes any ACTIVE recurring sprint mid-cycle
--    (entries cascade away) — the daily sprints are seed data, rebuilt below,
--    and real users re-join the fresh cycle.
DELETE FROM game_tournament
WHERE id IN (
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444'
)
OR metadata->>'type' = 'recurring';

-- 3. Seed exactly ONE recurring daily tournament per active game.
--    Deterministic UUIDs (uuid v5 from a fixed namespace) make this
--    idempotent — re-running the same statement never duplicates.
INSERT INTO game_tournament (
  id, game_id, title, description, entry_fee_xp, prize_xp,
  max_players, starts_at, ends_at, status, metadata
)
SELECT
  uuid_generate_v5(
    '6ba7b810-9dad-11d1-80b4-00c04fd430c8'::uuid,
    'tournament:' || g.slug
  ),
  g.id,
  g.name || ' Daily Sprint',
  'Compete for the highest score in ' || g.name || ' before time runs out!',
  GREATEST(COALESCE((g.metadata->>'winScore')::integer, 5) * 2, 10),
  GREATEST(COALESCE((g.metadata->>'maxXp')::integer, 25) * 5, 100),
  100,
  NOW(),
  NOW() + INTERVAL '24 hours',
  'ACTIVE',
  jsonb_build_object('type', 'recurring', 'seed', true)
FROM game g
WHERE g.is_active = TRUE
ON CONFLICT (id) DO NOTHING;
