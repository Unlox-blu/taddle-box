CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS users (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                      VARCHAR(100) NOT NULL,
  username                  VARCHAR(30)  NOT NULL UNIQUE,
  email                     VARCHAR(255) NOT NULL UNIQUE,
  country_code              VARCHAR(5)   
                              CHECK (country_code ~ '^\+[0-9]{1,4}$'),
  phone_number              VARCHAR(20)  UNIQUE
                              CHECK (phone_number ~ '^[0-9]{3,15}$'),
  date_of_birth             DATE
  gender                    VARCHAR(20) 
                              CHECK (gender IN ('male', 'female', 'other')),
  password_hash             TEXT,
  privacy                   VARCHAR(20)  NOT NULL DEFAULT 'public'
                              CHECK (privacy IN ('public','private')),
  theme                     VARCHAR(10) NOT NULL DEFAULT 'light'
                              CHECK (theme IN ('light', 'dark', 'system')),
  google_id                 VARCHAR(255) UNIQUE,
  avatar_url                UUID REFERENCES media(id) ON DELETE SET NULL,
  banner_url                UUID REFERENCES media(id) ON DELETE SET NULL,
  bio                       TEXT,
  location                  VARCHAR(255),
  college                   VARCHAR(255),
  interests                 JSONB,
  website_url               TEXT,
  role                      VARCHAR(20)  NOT NULL DEFAULT 'user'
                              CHECK (role IN ('user','moderator','admin','superadmin')),
  flags                     INTEGER NOT NULL DEFAULT 0,  -- (email/phone/isVerified) 
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
  app_lock                  VARCHAR(4)   CHECK (length(app_lock) = 4),
  app_lock_enabled          BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at                TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
