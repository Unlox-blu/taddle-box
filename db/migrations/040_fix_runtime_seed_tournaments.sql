-- Fix runtime for tap-rush and memory-grid
UPDATE game
SET metadata = jsonb_set(metadata, '{runtime}', '"native"')
WHERE slug IN ('tap-rush', 'memory-grid');

-- Seed tournaments for all active games if they don't have one
INSERT INTO game_tournament (
    game_id, 
    title, 
    description, 
    entry_fee_xp, 
    prize_xp, 
    max_players, 
    starts_at, 
    ends_at, 
    status,
    metadata
)
SELECT 
    id AS game_id,
    name || ' Daily Sprint',
    'Compete to get the highest score in ' || name || ' before time runs out!',
    COALESCE((metadata->>'winScore')::integer * 2, 10), -- entry fee
    COALESCE((metadata->>'maxXp')::integer * 5, 100),    -- prize
    100, -- max players
    NOW(),
    NOW() + INTERVAL '24 hours',
    'ACTIVE',
    '{"type": "recurring"}'::jsonb
FROM game 
WHERE is_active = TRUE
  AND NOT EXISTS (
      SELECT 1 FROM game_tournament 
      WHERE game_id = game.id AND status IN ('ACTIVE', 'PENDING')
  );
