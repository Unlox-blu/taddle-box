-- Migration: Seed initial bots
-- Date: 2026-09-08

BEGIN;

INSERT INTO bots (
  id,
  username,
  avatar,
  rating,
  level,
  difficulty,
  game_type,
  ai_profile,
  ai_version,
  is_active
)
VALUES
  ('bot_001', 'Aarav Singh', 'https://i.pravatar.cc/150?img=12', 1250, 10, 'easy', 'all', 'default', '1.0', true),
  ('bot_002', 'Trisha', 'https://imgtree.co/direct/zdoNE3sg', 1420, 15, 'medium', 'all', 'default', '1.0', true),
  ('bot_003', 'Kabir Mehta', 'https://i.pravatar.cc/150?img=59', 1600, 20, 'medium', 'all', 'default', '1.0', true),
  ('bot_004', 'Ananya Iyer', 'https://i.pravatar.cc/150?img=32', 1100, 8, 'easy', 'all', 'default', '1.0', true),
  ('bot_005', 'Rohan Khanna', 'https://i.pravatar.cc/150?img=68', 1350, 12, 'medium', 'all', 'default', '1.0', true),
  ('bot_006', 'Sara Khan', 'https://i.pravatar.cc/150?img=25', 1550, 18, 'medium', 'all', 'default', '1.0', true),
  ('bot_007', 'Arjun Reddy', 'https://i.pravatar.cc/150?img=53', 1800, 25, 'hard', 'all', 'default', '1.0', true),
  ('bot_008', 'Thalapathy Vijay', 'https://imgtree.co/direct/yZfKfhS8', 1950, 30, 'hard', 'all', 'default', '1.0', true)
ON CONFLICT (id) DO NOTHING;

COMMIT;
