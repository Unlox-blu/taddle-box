-- 006_create_posts.sql
CREATE TABLE IF NOT EXISTS posts (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  author_id      UUID        NOT NULL REFERENCES users(id)       ON DELETE CASCADE,
  community_id   UUID        REFERENCES communities(id)          ON DELETE SET NULL,
  title          VARCHAR(300),
  content        TEXT,
  media          JSONB        NOT NULL DEFAULT '[]',
  post_type      VARCHAR(20)  NOT NULL DEFAULT 'text'
                   CHECK (post_type IN ('text','image','video','link','poll')),
  tags           TEXT[]       NOT NULL DEFAULT '{}',
  category       TEXT[]       NOT NULL DEFAULT '{}',
  status         VARCHAR(20)  NOT NULL DEFAULT 'published'
                   CHECK (status IN ('draft','published','archived','removed')),
  visibility     VARCHAR(20)  NOT NULL DEFAULT 'public'
                   CHECK (visibility IN ('public','community_only','private')),
  likes_count    INTEGER      NOT NULL DEFAULT 0 CHECK (likes_count    >= 0),
  comments_count INTEGER      NOT NULL DEFAULT 0 CHECK (comments_count >= 0),
  shares_count   INTEGER      NOT NULL DEFAULT 0 CHECK (shares_count   >= 0),
  views_count    INTEGER      NOT NULL DEFAULT 0 CHECK (views_count    >= 0),
  is_pinned      BOOLEAN      NOT NULL DEFAULT FALSE,
  poll_data      JSONB,
  link_data      JSONB,
  published_at   TIMESTAMPTZ,
  deleted_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
