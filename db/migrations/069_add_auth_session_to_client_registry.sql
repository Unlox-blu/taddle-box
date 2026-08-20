-- 069_add_auth_session_to_client_registry.sql
--
-- Extends client_registry with auth session fields so the same table
-- handles: user ↔ device ↔ auth session ↔ push registration.
--
-- This eliminates the single-session bottleneck in users.refresh_token_hash
-- and enables:
--   - Multi-device login (same account, multiple devices)
--   - Multi-user login (multiple accounts, same device)
--   - Per-device session revocation (logout from one device only)

-- 1. Add auth session columns
ALTER TABLE client_registry
  ADD COLUMN IF NOT EXISTS refresh_hash       VARCHAR(255),
  ADD COLUMN IF NOT EXISTS session_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revoked_at         TIMESTAMPTZ;

-- 2. Session lookup index: find the active session by session_id for refresh
CREATE INDEX IF NOT EXISTS idx_client_registry_session_id
  ON client_registry(session_id)
  WHERE revoked_at IS NULL;

-- 3. Cleanup index: find expired sessions for periodic sweeps
CREATE INDEX IF NOT EXISTS idx_client_registry_session_expiry
  ON client_registry(session_expires_at)
  WHERE revoked_at IS NULL AND session_expires_at IS NOT NULL;

-- 4. Migrate existing refresh_token_hash from users table into client_registry.
--    For each user with an active client_registry row, copy the hash over.
--    Users with no client_registry row keep their hash in users (legacy fallback).
UPDATE client_registry cr
SET refresh_hash = u.refresh_token_hash,
    session_expires_at = NOW() + INTERVAL '7 days',
    updated_at = NOW()
FROM users u
WHERE cr.user_id = u.id
  AND cr.is_active = TRUE
  AND u.refresh_token_hash IS NOT NULL
  AND cr.refresh_hash IS NULL;

COMMENT ON COLUMN client_registry.refresh_hash
  IS 'SHA-256 hash of the JWT refresh token for this session. NULL = legacy row without auth session.';
COMMENT ON COLUMN client_registry.session_expires_at
  IS 'Expiry timestamp for the refresh token in this session.';
COMMENT ON COLUMN client_registry.revoked_at
  IS 'Non-NULL = session has been revoked (logout). Revoked rows are excluded from auth lookups.';
