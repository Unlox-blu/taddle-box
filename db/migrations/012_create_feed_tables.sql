CREATE TABLE IF NOT EXISTS user_feed_preferences (
  user_id              UUID    PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  preferred_categories TEXT[]  NOT NULL DEFAULT '{}',
  preferred_tags       TEXT[]  NOT NULL DEFAULT '{}',
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS post_interactions (
  user_id          UUID        NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  post_id          UUID        NOT NULL REFERENCES posts(id)  ON DELETE CASCADE,
  interaction_type VARCHAR(20) NOT NULL CHECK (interaction_type IN ('view','like','comment','share','save')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, post_id, interaction_type)
);
