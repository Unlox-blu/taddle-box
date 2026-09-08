BEGIN;

-- 1. Broaden game_sessions to support multiplayer
ALTER TABLE game_sessions
  ADD COLUMN session_type VARCHAR(20) DEFAULT 'SINGLE_PLAYER' CHECK (session_type IN ('SINGLE_PLAYER', 'MULTIPLAYER')),
  ADD COLUMN mode VARCHAR(20),
  ADD COLUMN max_players INTEGER DEFAULT 1;

ALTER TABLE game_sessions
  ALTER COLUMN user_id DROP NOT NULL,
  ALTER COLUMN seed DROP NOT NULL,
  ALTER COLUMN expires_at DROP NOT NULL;

ALTER TABLE game_sessions RENAME COLUMN completed_at TO ended_at;

-- 2. Create the Bot Registry
CREATE TABLE bots (
  id VARCHAR(50) PRIMARY KEY,
  username VARCHAR(100) NOT NULL,
  avatar VARCHAR(255),
  rating INTEGER NOT NULL DEFAULT 1200,
  level INTEGER NOT NULL DEFAULT 1,
  difficulty VARCHAR(20) NOT NULL DEFAULT 'medium',
  game_type VARCHAR(50) NOT NULL,
  ai_profile VARCHAR(50),
  ai_version VARCHAR(20),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Create the Unified Participants Roster
CREATE TABLE game_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_session_id UUID NOT NULL REFERENCES game_sessions(id),
  player_type VARCHAR(10) NOT NULL CHECK (player_type IN ('HUMAN', 'BOT')),
  
  user_id UUID REFERENCES users(id),
  bot_id VARCHAR(50) REFERENCES bots(id),
  
  seat INTEGER NOT NULL,
  snapshot JSONB NOT NULL,
  
  result VARCHAR(10) CHECK (result IN ('WIN', 'LOSS', 'DRAW')),
  score INTEGER NOT NULL DEFAULT 0,
  xp_earned INTEGER NOT NULL DEFAULT 0,
  rating_change INTEGER NOT NULL DEFAULT 0,
  
  ws_token VARCHAR(64),
  player_color VARCHAR(30),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE (game_session_id, seat),
  UNIQUE (game_session_id, user_id),
  CHECK (
    (player_type = 'HUMAN' AND user_id IS NOT NULL AND bot_id IS NULL) OR
    (player_type = 'BOT' AND bot_id IS NOT NULL AND user_id IS NULL)
  )
);

-- 4. Migrate session definitions from game_matches to game_sessions
INSERT INTO game_sessions (id, game_id, session_type, mode, status, started_at, ended_at, metadata)
SELECT id, game_id, 'MULTIPLAYER', mode, status, started_at, ended_at, metadata 
FROM game_matches
ON CONFLICT (id) DO NOTHING;

-- 5. Migrate rosters and historical stats from match_members and game_match
-- Note: Taddle seats are zero-indexed, hence row_number() - 1
INSERT INTO game_participants (
  game_session_id, player_type, user_id, seat, snapshot,
  ws_token, player_color, score, xp_earned, result, created_at
)
SELECT 
  mm.match_id, 
  'HUMAN', 
  mm.user_id, 
  row_number() over (partition by mm.match_id order by mm.created_at, mm.user_id) - 1,
  jsonb_build_object(
    'id', u.id,
    'username', u.username,
    'avatar', u.avatar_url,
    'isBot', false
  ),
  mm.ws_token, 
  mm.player_color, 
  COALESCE(gmatch.score, 0), 
  COALESCE(gmatch.xp_earned, 0), 
  gmatch.result, 
  mm.created_at
FROM match_members mm
JOIN users u ON u.id = mm.user_id
LEFT JOIN game_matchmaking_ticket ticket 
  ON ticket.match_group_id = mm.match_id AND ticket.user_id = mm.user_id
LEFT JOIN game_match gmatch 
  ON gmatch.id = ticket.user_match_id
ON CONFLICT DO NOTHING;

COMMIT;
