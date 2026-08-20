-- 067_create_client_registry.sql
--
-- client_registry: device-centric registration table replacing device_notification.
-- Supports:
--   - multi-session  (multiple sessions per device)
--   - multi-account  (multiple users per device, e.g. family/shared iPad)
--   - multi-device   (multiple devices per user)
--
-- Design:
--   Natural key: (device_id, user_id) — one row per account per installation.
--   device_id is a stable, client-generated UUID identifying the physical
--   installation. It does NOT change across app updates or reinstalls.
--
--   session_id links to the session that established this registration and is
--   used for ownership verification on device-wide token updates.
--
--   push_token is device-wide: when a token refreshes, ALL rows for the
--   device_id are updated. The notification send path dedupes by device_id
--   so each physical device receives exactly one push per event.

-- 1. Create the new table
CREATE TABLE client_registry (
  id              SERIAL PRIMARY KEY,

  -- Device installation identity (stable UUID per physical installation)
  device_id       VARCHAR(128) NOT NULL,

  -- User account active on this device
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Session that established this registration (for ownership verification)
  session_id      VARCHAR(255) NOT NULL,

  -- Push notification registration (device-wide — shared across accounts)
  push_token      TEXT,
  push_provider   VARCHAR(20) DEFAULT 'expo',
  platform        VARCHAR(20),

  -- Status flags
  is_active              BOOLEAN DEFAULT TRUE,
  notifications_enabled  BOOLEAN DEFAULT TRUE,

  -- Metadata
  app_version    VARCHAR(50),
  os_version     VARCHAR(50),
  last_seen_at   TIMESTAMP DEFAULT NOW(),

  created_at     TIMESTAMP DEFAULT NOW(),
  updated_at     TIMESTAMP DEFAULT NOW(),

  -- One registration per device per user
  CONSTRAINT client_registry_device_user UNIQUE (device_id, user_id)
);

-- 2. Indexes
-- Send query: active, enabled devices per user (with push token)
CREATE INDEX idx_client_registry_push_delivery
  ON client_registry(user_id, notifications_enabled, is_active)
  WHERE push_token IS NOT NULL;

-- Device-wide token update: find all rows for a device
CREATE INDEX idx_client_registry_device
  ON client_registry(device_id)
  WHERE is_active = TRUE;

-- Session lookup for ownership verification
CREATE INDEX idx_client_registry_session
  ON client_registry(session_id);

-- General user lookup
CREATE INDEX idx_client_registry_user_active
  ON client_registry(user_id)
  WHERE is_active = TRUE;

-- 3. Migrate data from device_notification
-- Generates synthetic session_ids for legacy data.
INSERT INTO client_registry (
  device_id, user_id, session_id, push_token, push_provider, platform,
  is_active, notifications_enabled, created_at
)
SELECT
  dn.device_id,
  dn.user_id,
  'legacy-' || dn.user_id || '-' || dn.device_id AS session_id,
  dn.push_token,
  dn.push_provider,
  dn.platform,
  dn.is_active,
  dn.notifications_enabled,
  dn.created_at
FROM device_notification dn
ON CONFLICT (device_id, user_id) DO NOTHING;

-- 4. Mark old table as deprecated (keep for rollback safety)
COMMENT ON TABLE device_notification
  IS 'DEPRECATED: migrated to client_registry (067). Remove after verification.';
