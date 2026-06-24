CREATE TABLE IF NOT EXISTS task (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                   UUID NOT NULL unique REFERENCES users(id) ON DELETE CASCADE,
  post_count                INTEGER      NOT NULL DEFAULT 0 CHECK (post_count      >= 0),
  share_count               INTEGER      NOT NULL DEFAULT 0 CHECK (share_count      >= 0),
  streak                    INTEGER      NOT NULL DEFAULT 0 CHECK (streak      >= 0), 
  profile_completion        INTEGER      NOT NULL DEFAULT 0 CHECK (profile_completion      >= 0),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);