-- Migration 072: Rename global_lock_enabled → global_account_lock_enabled
-- 
-- Consistent naming across frontend and backend:
--   DB column:          global_account_lock_enabled
--   Backend JS field:   globalAccountLockEnabled
--   Frontend field:     globalAccountLockEnabled

BEGIN;

ALTER TABLE users RENAME COLUMN global_lock_enabled TO global_account_lock_enabled;

COMMIT;
