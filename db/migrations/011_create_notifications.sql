<<<<<<< HEAD
CREATE TABLE IF NOT EXISTS users_notifications (
  
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    recipient_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    notification_type   VARCHAR(30) NOT NULL,
    resource_type       VARCHAR(30),
    resource_id         UUID,

    title               TEXT,

    mode                VARCHAR(10)  NOT NULL
                          CHECK (mode IN ('SINGLE','BATCH')),

    sender_ids          UUID[] DEFAULT '{}',

    sender_count        INTEGER DEFAULT 1,

    is_read             BOOLEAN DEFAULT FALSE,

    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
)
=======
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

>>>>>>> 5b2004b6cdc754160b22e5fe51fcab9b80dbb0b2
