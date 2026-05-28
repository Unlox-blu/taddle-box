-- 008_create_comments.sql
CREATE TABLE IF NOT EXISTS comments (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id     UUID        NOT NULL REFERENCES posts(id)    ON DELETE CASCADE,
  author_id   UUID        NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  parent_id   UUID        REFERENCES comments(id)          ON DELETE SET NULL,
  content     TEXT        NOT NULL,
  depth       SMALLINT    NOT NULL DEFAULT 0 CHECK (depth >= 0 AND depth <= 5),
  path        UUID[]      NOT NULL DEFAULT '{}',
  likes_count INTEGER     NOT NULL DEFAULT 0 CHECK (likes_count >= 0),
  status      VARCHAR(20) NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','hidden','removed')),
  deleted_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS comment_likes (
  comment_id UUID        NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (comment_id, user_id)
);
