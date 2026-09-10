-- Migration: Seed initial bots
-- Date: 2026-09-08
-- Avatars are self-hosted on S3 (avatars/bots/<botId>.jpg) — same public-URL
-- path as real user avatars. No third-party image URLs (SSOT; the originals
-- were pravatar/imgtree URLs, migrated by scripts/sync-bot-avatars-to-s3.js).

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
  ('bot_001', 'Aarav Singh', 'https://unlox-dev-test.s3.ap-south-1.amazonaws.com/avatars/bots/bot_001.jpg', 1250, 10, 'easy', 'all', 'default', '1.0', true),
  ('bot_002', 'Trisha', 'https://unlox-dev-test.s3.ap-south-1.amazonaws.com/avatars/bots/bot_002.jpg', 1420, 15, 'medium', 'all', 'default', '1.0', true),
  ('bot_003', 'Kabir Mehta', 'https://unlox-dev-test.s3.ap-south-1.amazonaws.com/avatars/bots/bot_003.jpg', 1600, 20, 'medium', 'all', 'default', '1.0', true),
  ('bot_004', 'Ananya Iyer', 'https://unlox-dev-test.s3.ap-south-1.amazonaws.com/avatars/bots/bot_004.jpg', 1100, 8, 'easy', 'all', 'default', '1.0', true),
  ('bot_005', 'Rohan Khanna', 'https://unlox-dev-test.s3.ap-south-1.amazonaws.com/avatars/bots/bot_005.jpg', 1350, 12, 'medium', 'all', 'default', '1.0', true),
  ('bot_006', 'Sara Khan', 'https://unlox-dev-test.s3.ap-south-1.amazonaws.com/avatars/bots/bot_006.jpg', 1550, 18, 'medium', 'all', 'default', '1.0', true),
  ('bot_007', 'Arjun Reddy', 'https://unlox-dev-test.s3.ap-south-1.amazonaws.com/avatars/bots/bot_007.jpg', 1800, 25, 'hard', 'all', 'default', '1.0', true),
  ('bot_008', 'Thalapathy Vijay', 'https://unlox-dev-test.s3.ap-south-1.amazonaws.com/avatars/bots/bot_008.jpg', 1950, 30, 'hard', 'all', 'default', '1.0', true)
ON CONFLICT (id) DO NOTHING;

COMMIT;
