CREATE TABLE IF NOT EXISTS notifications (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipient_id  UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_id     UUID        REFERENCES users(id) ON DELETE SET NULL,
  type          VARCHAR(50) NOT NULL,
  title         VARCHAR(200) NOT NULL,
  message       TEXT,
  resource_type VARCHAR(50),
  resource_id   UUID,
  is_read       BOOLEAN     NOT NULL DEFAULT FALSE,
  read_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE TABLE IF NOT EXISTS batch_notifications (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipient_id  UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_id     UUID[] ,
  type          VARCHAR(50) NOT NULL,
  title         VARCHAR(200) NOT NULL,
  resource_type VARCHAR(50),
  resource_id   UUID,
  is_read       BOOLEAN     NOT NULL DEFAULT FALSE,
  read_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS promotional_notifications (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sender_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id  UUID[] DEFAULT '{}',
  type          VARCHAR(50) NOT NULL,
  title         VARCHAR(200) NOT NULL,
  resource_type VARCHAR(50),
  resource_id   UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

