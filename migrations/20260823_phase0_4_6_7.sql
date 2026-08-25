-- Migration: Phase 0, 4, 6, 7 — remaining schema changes
-- Date: 2026-08-23
-- Adds: game table columns, reward_claims, anti_cheat_events, admin_audit_log

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Game table: runtime/version columns (Phase 3 + 7)
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE game
    ADD COLUMN IF NOT EXISTS runtime_type VARCHAR(10) DEFAULT 'app',
    ADD COLUMN IF NOT EXISTS runtime VARCHAR(50) DEFAULT 'reaction-v1',
    ADD COLUMN IF NOT EXISTS runtime_version INTEGER DEFAULT 1,
    ADD COLUMN IF NOT EXISTS game_version INTEGER DEFAULT 1,
    ADD COLUMN IF NOT EXISTS execution_model VARCHAR(20) DEFAULT 'real-time';

-- CHECK constraints
DO $$ BEGIN
    ALTER TABLE game ADD CONSTRAINT chk_game_runtime_type
        CHECK (runtime_type IN ('app', 'web'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE game ADD CONSTRAINT chk_game_execution_model
        CHECK (execution_model IN ('turn-based', 'real-time', 'round-based', 'simultaneous'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE game ADD CONSTRAINT chk_game_version_positive
        CHECK (game_version > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE game ADD CONSTRAINT chk_game_runtime_version_positive
        CHECK (runtime_version > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Web-specific fields (only used when runtime_type = 'web')
ALTER TABLE game
    ADD COLUMN IF NOT EXISTS web_bundle_url TEXT,
    ADD COLUMN IF NOT EXISTS web_bundle_version VARCHAR(20),
    ADD COLUMN IF NOT EXISTS web_bundle_hash VARCHAR(100),
    ADD COLUMN IF NOT EXISTS max_bundle_size_bytes INTEGER DEFAULT 2097152;

-- Backfill existing games with correct execution_model
UPDATE game SET
    execution_model = CASE
        WHEN slug IN ('chess', 'ludo', 'snake-ladder') THEN 'turn-based'
        WHEN slug IN ('tap-rush', 'memory-grid') THEN 'real-time'
        WHEN slug IN ('word-rush', 'scribble') THEN 'round-based'
        ELSE 'real-time'
    END
WHERE execution_model = 'real-time' AND slug IN ('chess', 'ludo', 'snake-ladder', 'word-rush', 'scribble');

-- Backfill runtime from metadata
UPDATE game SET
    runtime = CASE
        WHEN slug = 'chess' THEN 'chess-v1'
        WHEN slug = 'ludo' THEN 'board-v1'
        WHEN slug = 'snake-ladder' THEN 'snake-ladder-v1'
        WHEN slug = 'scribble' THEN 'scribble-v1'
        WHEN slug = 'word-rush' THEN 'word-v1'
        WHEN slug = 'tap-rush' THEN 'reaction-v1'
        WHEN slug = 'memory-grid' THEN 'memory-v1'
        ELSE 'reaction-v1'
    END
WHERE runtime = 'reaction-v1';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. game_matches: config/RNG pinning (Phase 3)
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE game_matches
    ADD COLUMN IF NOT EXISTS game_version INTEGER DEFAULT 1,
    ADD COLUMN IF NOT EXISTS config_version INTEGER DEFAULT 1,
    ADD COLUMN IF NOT EXISTS config_snapshot JSONB DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS random_seed VARCHAR(64);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. reward_claims — idempotent reward table (Phase 4.1A)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS reward_claims (
    id          BIGSERIAL PRIMARY KEY,
    match_id    UUID NOT NULL,
    user_id     UUID NOT NULL,
    reward_type VARCHAR(50) NOT NULL,
    amount      INTEGER NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_reward_claims UNIQUE (match_id, user_id, reward_type)
);

CREATE INDEX IF NOT EXISTS idx_reward_claims_user
    ON reward_claims (user_id, created_at);

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. anti_cheat_events — audit trail for suspicious activity (Phase 6.6)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS anti_cheat_events (
    id          BIGSERIAL PRIMARY KEY,
    match_id    UUID NOT NULL,
    user_id     UUID NOT NULL,
    game_slug   VARCHAR(50) NOT NULL,
    event_type  VARCHAR(50) NOT NULL,
    severity    VARCHAR(20) NOT NULL DEFAULT 'LOW',
    details     JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed    BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_anti_cheat_user
    ON anti_cheat_events (user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_anti_cheat_unreviewed
    ON anti_cheat_events (severity, created_at)
    WHERE NOT reviewed;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. admin_audit_log — immutable admin action log (Phase 6.9)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS admin_audit_log (
    id              BIGSERIAL PRIMARY KEY,
    admin_user_id   UUID NOT NULL,
    action          VARCHAR(100) NOT NULL,
    target_type     VARCHAR(50) NOT NULL,
    target_id       VARCHAR(100) NOT NULL,
    payload         JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_admin
    ON admin_audit_log (admin_user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_audit_action
    ON admin_audit_log (action, created_at);

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Engine limits: update defaults for existing games
-- ═══════════════════════════════════════════════════════════════════════════
UPDATE game_engine_limits gel SET
    turn_timeout_ms = CASE
        WHEN g.slug = 'chess' THEN 600000
        WHEN g.slug = 'ludo' THEN 30000
        WHEN g.slug = 'snake-ladder' THEN 12000
        ELSE 60000
    END,
    max_command_execution_ms = CASE
        WHEN g.slug = 'tap-rush' THEN 200
        ELSE 500
    END
FROM game g WHERE gel.game_id = g.id;

COMMIT;
