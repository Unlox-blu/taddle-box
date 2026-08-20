-- Migration 070: Rename lock fields and add wallet_lock_enabled
--
-- 1. Rename columns:
--    app_lock          → lock_pin
--    app_lock_enabled  → global_lock_enabled
--
-- 2. Add new column:
--    wallet_lock_enabled  BOOLEAN NOT NULL DEFAULT FALSE
--
-- 3. Existing users with a PIN (lock_pin IS NOT NULL) get wallet_lock_enabled
--    set to TRUE as a safe default — they clearly wanted lock protection.

-- Rename the columns (PostgreSQL supports ALTER COLUMN RENAME)
ALTER TABLE users RENAME COLUMN app_lock TO lock_pin;
ALTER TABLE users RENAME COLUMN app_lock_enabled TO global_lock_enabled;

-- Add the new wallet lock column
ALTER TABLE users ADD COLUMN wallet_lock_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- Migrate: if a user already had a PIN set, enable wallet lock too as safe default
UPDATE users SET wallet_lock_enabled = TRUE WHERE lock_pin IS NOT NULL;

-- Add an index for quick lookups during PIN verification
CREATE INDEX IF NOT EXISTS idx_users_lock_pin ON users(id) WHERE lock_pin IS NOT NULL;
