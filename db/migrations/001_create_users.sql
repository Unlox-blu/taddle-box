-- 001_create_users.sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS users (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                      VARCHAR(100) NOT NULL,
  username                  VARCHAR(30)  NOT NULL UNIQUE,
  email                     VARCHAR(255) NOT NULL UNIQUE,
  password_hash             TEXT,
  google_id                 VARCHAR(255) UNIQUE,
  avatar_url                TEXT,
  banner_url                TEXT,
  bio                       TEXT,
  website_url               TEXT,
  role                      VARCHAR(20)  NOT NULL DEFAULT 'user'
                              CHECK (role IN ('user','moderator','admin','superadmin')),
  is_verified               BOOLEAN      NOT NULL DEFAULT FALSE,
  is_active                 BOOLEAN      NOT NULL DEFAULT TRUE,
  is_banned                 BOOLEAN      NOT NULL DEFAULT FALSE,
  follower_count            INTEGER      NOT NULL DEFAULT 0 CHECK (follower_count  >= 0),
  following_count           INTEGER      NOT NULL DEFAULT 0 CHECK (following_count >= 0),
  post_count                INTEGER      NOT NULL DEFAULT 0 CHECK (post_count      >= 0),
  refresh_token_hash        TEXT,
  email_verify_token_hash   TEXT,
  email_verify_token_exp    TIMESTAMPTZ,
  password_reset_token_hash TEXT,
  password_reset_token_exp  TIMESTAMPTZ,
  email_verified_at         TIMESTAMPTZ,
  last_login_at             TIMESTAMPTZ,
  deleted_at                TIMESTAMPTZ,
  created_at                TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
