-- 005_create_community_members.sql
CREATE TABLE IF NOT EXISTS community_members (
  community_id UUID        NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id      UUID        NOT NULL REFERENCES users(id)       ON DELETE CASCADE,
  role         VARCHAR(20) NOT NULL DEFAULT 'member'
                 CHECK (role IN ('member','moderator','admin')),
  status       VARCHAR(20) NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active','pending','banned')),
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (community_id, user_id)
);
