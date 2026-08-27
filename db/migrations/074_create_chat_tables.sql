-- ============================================================
-- Chat system tables
-- Run: psql -f migrations/20260822_create_chat_tables.sql
-- ============================================================

-- Conversations (1:1 DM between mutual followers)
CREATE TABLE IF NOT EXISTS conversations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message  TEXT,
  last_message_at TIMESTAMPTZ
);

-- Conversation participants (2 per conversation for 1:1 DMs)
CREATE TABLE IF NOT EXISTS conversation_participants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_read_at    TIMESTAMPTZ,
  UNIQUE(conversation_id, user_id)
);

-- Messages
CREATE TABLE IF NOT EXISTS messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_type    TEXT NOT NULL DEFAULT 'text',  -- text | post | game_invite
  content         TEXT,                          -- text content or NULL for shares
  -- For post shares
  post_id         UUID REFERENCES posts(id) ON DELETE SET NULL,
  -- For game invites
  game_name       TEXT,
  game_invite_code TEXT,
  game_lobby_id   TEXT,
  -- Reactions (JSONB: { "emoji": ["userId1", "userId2"] })
  reactions       JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_conv_participants_user ON conversation_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_conv_participants_conv ON conversation_participants(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);

-- Auto-update conversation timestamp on new message
CREATE OR REPLACE FUNCTION update_conversation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE conversations
  SET updated_at = NOW(),
      last_message = COALESCE(NEW.content, NEW.message_type),
      last_message_at = NEW.created_at
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_update_conversation
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_timestamp();
