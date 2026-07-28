INSERT INTO game (id, name, slug, description, thumbnail, category, difficulty, is_active, metadata)
SELECT
  '11111111-1111-4111-8111-111111111111',
  'Tap Rush',
  'tap-rush',
  'Tap glowing targets before time runs out.',
  NULL,
  'arcade',
  'easy',
  TRUE,
  '{"runtime":"html5_webview","maxXp":35,"durationSeconds":20,"winScore":14}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM game WHERE slug = 'tap-rush');

INSERT INTO game (id, name, slug, description, thumbnail, category, difficulty, is_active, metadata)
SELECT
  '22222222-2222-4222-8222-222222222222',
  'Memory Grid',
  'memory-grid',
  'Memorize and replay tile patterns.',
  NULL,
  'memory',
  'easy',
  TRUE,
  '{"runtime":"html5_webview","maxXp":45,"maxScore":5,"winScore":5}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM game WHERE slug = 'memory-grid');
