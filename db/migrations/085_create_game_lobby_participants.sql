BEGIN;

-- Pre-session bot roster for matchmaking lobbies.
--
-- During the matchmaking window bots are assigned to lobby seats here.
-- This is the single source of truth for which bots are in a lobby before
-- the match is created. When fillMatchmakingLobby runs it reads from this
-- table (not from game_lobby.settings) and promotes rows into game_participants.
--
-- Rows are deleted when:
--   - a bot is removed by the host (removeLobbyPlayer)
--   - the lobby is cancelled / timed out (ON DELETE CASCADE via lobby_id FK)
--
-- game_lobby.settings retains only pacing config (botFillNextAt) — no roster data.

CREATE TABLE game_lobby_participants (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lobby_id    UUID        NOT NULL REFERENCES game_lobby(id) ON DELETE CASCADE,
  bot_id      VARCHAR(50) NOT NULL REFERENCES bots(id),
  instance_id VARCHAR(100) NOT NULL,  -- unique engine identity: bot_001_<lobbyHash>_<seat>
  seat        INTEGER     NOT NULL,
  snapshot    JSONB       NOT NULL,   -- { username, name, avatar, rating, level, badge, difficulty, team }
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (lobby_id, seat),
  UNIQUE (lobby_id, bot_id),          -- one profile per lobby (different seats = different profiles)
  UNIQUE (lobby_id, instance_id)      -- instance_id is globally unique within a lobby
);

CREATE INDEX idx_game_lobby_participants_lobby_id ON game_lobby_participants (lobby_id);

-- Migrate any existing bots already stored in settings.bots[] so no data is lost.
-- Each element has: id (bots.id FK), instanceId, seat, and profile fields.
INSERT INTO game_lobby_participants (lobby_id, bot_id, instance_id, seat, snapshot)
SELECT
  gl.id AS lobby_id,
  (bot->>'id')::VARCHAR(50) AS bot_id,
  bot->>'instanceId'        AS instance_id,
  (bot->>'seat')::INTEGER   AS seat,
  jsonb_build_object(
    'username',   bot->>'username',
    'name',       bot->>'name',
    'avatar',     bot->>'avatar',
    'rating',     (bot->>'rating')::INTEGER,
    'level',      (bot->>'level')::INTEGER,
    'badge',      bot->>'badge',
    'difficulty', bot->>'difficulty',
    'team',       (bot->>'team')::INTEGER
  ) AS snapshot
FROM game_lobby gl,
     jsonb_array_elements(gl.settings->'bots') AS bot
WHERE gl.settings ? 'bots'
  AND jsonb_array_length(gl.settings->'bots') > 0
  AND gl.status IN ('WAITING', 'LOCKED')
ON CONFLICT DO NOTHING;

-- Add instance_id to game_participants so the engine identity is persisted
-- and uniquely enforced at the game roster level too.
ALTER TABLE game_participants
  ADD COLUMN IF NOT EXISTS instance_id VARCHAR(100);

-- Backfill from snapshot for any existing bot rows
UPDATE game_participants
SET instance_id = snapshot->>'instanceId'
WHERE player_type = 'BOT' AND instance_id IS NULL;

-- Enforce uniqueness of instance_id within a session
CREATE UNIQUE INDEX IF NOT EXISTS uq_game_participants_session_instance
  ON game_participants (game_session_id, instance_id)
  WHERE instance_id IS NOT NULL;

-- Strip bots[] from settings now that they live in game_lobby_participants.
-- Keep all other settings keys (mode, targetPlayers, botFillNextAt, etc.).
UPDATE game_lobby
SET settings = settings - 'bots'
WHERE settings ? 'bots';

COMMIT;
