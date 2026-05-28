CREATE TABLE IF NOT EXISTS communities (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id     UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  name         VARCHAR(100) NOT NULL,
  slug         VARCHAR(120) NOT NULL UNIQUE,
  description  TEXT,
  avatar_url   TEXT,
  banner_url   TEXT,
  privacy      VARCHAR(20)  NOT NULL DEFAULT 'public'
                 CHECK (privacy IN ('public','private','restricted')),
  category     TEXT[]       NOT NULL DEFAULT '{}',
  rules        JSONB        NOT NULL DEFAULT '[]',
  member_count INTEGER      NOT NULL DEFAULT 0 CHECK (member_count >= 0),
  post_count   INTEGER      NOT NULL DEFAULT 0 CHECK (post_count   >= 0),
  is_active    BOOLEAN      NOT NULL DEFAULT TRUE,
  is_verified  BOOLEAN      NOT NULL DEFAULT FALSE,
  metadata     JSONB,
  deleted_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
