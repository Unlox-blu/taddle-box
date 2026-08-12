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

INSERT INTO game (id, name, slug, description, thumbnail, category, difficulty, is_active, metadata)
SELECT
  '33333333-3333-4333-8333-333333333333',
  'Scribble',
  'scribble',
  'Draw and guess words with friends.',
  NULL,
  'drawing',
  'easy',
  TRUE,
  '{"runtime":"native","maxXp":50,"entryFee":10}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM game WHERE slug = 'scribble');

INSERT INTO game (id, name, slug, description, thumbnail, category, difficulty, is_active, metadata)
SELECT
  '44444444-4444-4444-8444-444444444444',
  'Ludo Classic',
  'ludo',
  'The classic board game of Ludo.',
  NULL,
  'board',
  'medium',
  TRUE,
  '{"runtime":"native","maxXp":75,"entryFee":15,"maxPlayers":4}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM game WHERE slug = 'ludo');

INSERT INTO game (id, name, slug, description, thumbnail, category, difficulty, is_active, metadata)
SELECT
  '55555555-5555-4555-8555-555555555555',
  'Snake & Ladder',
  'snake-ladder',
  'Climb ladders and avoid snakes to reach 100 first.',
  NULL,
  'board',
  'easy',
  TRUE,
  '{"runtime":"native","maxXp":60,"entryFee":10,"maxPlayers":4}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM game WHERE slug = 'snake-ladder');

INSERT INTO game (id, name, slug, description, thumbnail, category, difficulty, is_active, metadata)
SELECT
  '66666666-6666-4666-8666-666666666666',
  'Chess',
  'chess',
  'The ultimate strategy board game.',
  NULL,
  'board',
  'hard',
  TRUE,
  '{"runtime":"native","maxXp":100,"entryFee":15}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM game WHERE slug = 'chess');

INSERT INTO game (id, name, slug, description, thumbnail, category, difficulty, is_active, metadata)
SELECT
  '77777777-7777-4777-8777-777777777777',
  'Word Rush',
  'word-rush',
  'Find as many words as you can in the grid.',
  NULL,
  'word',
  'medium',
  TRUE,
  '{"runtime":"native","maxXp":45,"entryFee":5}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM game WHERE slug = 'word-rush');
