CREATE TABLE IF NOT EXISTS community_moderation_log (
  id             BIGSERIAL PRIMARY KEY,
  community_id   UUID        NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  actor_id       UUID        NOT NULL REFERENCES users(id)       ON DELETE CASCADE,
  action         VARCHAR(40) NOT NULL,
  target_user_id UUID        REFERENCES users(id)                ON DELETE SET NULL,
  post_id        UUID        REFERENCES posts(id)                ON DELETE SET NULL,
  details        JSONB       NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_community_moderation_log_community
  ON community_moderation_log (community_id, created_at DESC);
