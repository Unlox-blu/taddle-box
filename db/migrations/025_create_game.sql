CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS game (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                      VARCHAR(50) NOT NULL,
  slug                      VARCHAR(50) NOT NULL,
  description               VARCHAR(255) NOT NULL,
  thumbnail                 TEXT,
  category                  VARCHAR(50),   
  difficulty                VARCHAR(50) NOT NULL DEFAULT 'easy'
                              CHECK (difficulty IN ('easy', 'medium', 'hard')),
  is_active                 BOOLEAN NOT NULL DEFAULT TRUE,
  metadata                  JSONB, 
  created_at                TIMESTAMPTZ DEFAULT NOW(),
  updated_at                TIMESTAMPTZ DEFAULT NOW()
);

