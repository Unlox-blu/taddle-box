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