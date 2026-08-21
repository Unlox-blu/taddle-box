-- Migration: Drop legacy refresh_token_hash from users table
-- We have moved to the client_registry for tracking sessions to support multi-device logins natively.

ALTER TABLE users DROP COLUMN IF EXISTS refresh_token_hash;
