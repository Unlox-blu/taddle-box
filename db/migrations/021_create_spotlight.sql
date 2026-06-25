CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS spotlight (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),            
  title                     VARCHAR(50) NOT NULL,
  description               VARCHAR(50) NOT NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
)