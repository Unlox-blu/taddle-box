CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS app_config (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),            
  latest_version            VARCHAR(20) NOT NULL,
  minimum_version           VARCHAR(20) NOT NULL,
  store_url                 TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
)