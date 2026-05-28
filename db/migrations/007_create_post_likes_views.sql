-- 007_create_post_likes.sql
CREATE TABLE IF NOT EXISTS post_likes (
  post_id    UUID        NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id)
);

-- 008_create_post_views.sql
CREATE TABLE IF NOT EXISTS post_views (
  post_id    UUID        NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id    UUID        REFERENCES users(id) ON DELETE SET NULL,
  ip_hash    VARCHAR(64),
  viewed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
