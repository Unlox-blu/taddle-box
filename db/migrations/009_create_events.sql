CREATE TABLE IF NOT EXISTS events (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organizer_id          UUID         NOT NULL REFERENCES users(id)       ON DELETE CASCADE,
  community_id          UUID         REFERENCES communities(id)          ON DELETE SET NULL,
  title                 VARCHAR(200) NOT NULL,
  description           TEXT,
  cover_image_url       TEXT,
  event_type            VARCHAR(20)  NOT NULL DEFAULT 'online'
                          CHECK (event_type IN ('online','offline','hybrid')),
  status                VARCHAR(20)  NOT NULL DEFAULT 'upcoming'
                          CHECK (status IN ('draft','upcoming','ongoing','completed','cancelled')),
  start_time            TIMESTAMPTZ  NOT NULL,
  end_time              TIMESTAMPTZ  NOT NULL,
  timezone              VARCHAR(60)  NOT NULL DEFAULT 'Asia/Kolkata',
  location              JSONB,
  is_free               BOOLEAN      NOT NULL DEFAULT TRUE,
  ticket_price_cents    INTEGER      NOT NULL DEFAULT 0 CHECK (ticket_price_cents >= 0),
  currency              CHAR(3)      NOT NULL DEFAULT 'INR',
  registration_deadline TIMESTAMPTZ,
  attendee_count        INTEGER      NOT NULL DEFAULT 0 CHECK (attendee_count >= 0),
  max_attendees         INTEGER      CHECK (max_attendees > 0),
  tags                  TEXT[]       NOT NULL DEFAULT '{}',
  is_featured           BOOLEAN      NOT NULL DEFAULT FALSE,
  metadata              JSONB,
  deleted_at            TIMESTAMPTZ,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CHECK (end_time > start_time)
);

CREATE TABLE IF NOT EXISTS event_attendees (
  event_id           UUID        NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id            UUID        NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  status             VARCHAR(20) NOT NULL DEFAULT 'registered'
                       CHECK (status IN ('registered','waitlisted','cancelled','attended')),
  razorpay_order_id  TEXT,
  razorpay_payment_id TEXT,
  registered_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (event_id, user_id)
);
