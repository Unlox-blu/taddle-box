CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS active_status (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),            
  user_id                   UUID REFERENCES users(id) ON DELETE CASCADE,
  is_active                 VARChAR NOT NULL DEFAULT 'online'
                                CHECK (is_active IN ('online','offline')),
  last_seen                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
)