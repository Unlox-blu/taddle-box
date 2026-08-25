-- Migration: Game Engine Architecture v2
-- Date: 2026-08-23
-- Core invariant: one command → one state transition → one event sequence → one durable transaction
-- Redis is the accelerator; PostgreSQL is the source of truth.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. game_commands — durable idempotency for every command processed
--    Redis holds a fast duplicate key; this table is the ground truth.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS game_commands (
    id              BIGSERIAL PRIMARY KEY,
    match_id        UUID        NOT NULL,
    command_id      UUID        NOT NULL,
    user_id         UUID        NOT NULL,
    command_type    VARCHAR(50) NOT NULL,
    state_revision  INTEGER     NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'PENDING',
        -- PENDING | PROCESSING | COMPLETED | FAILED
    result          JSONB,
    error_message   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ,

    CONSTRAINT uq_game_commands_match_cmd UNIQUE (match_id, command_id)
);

CREATE INDEX IF NOT EXISTS idx_game_commands_lookup
    ON game_commands (match_id, command_id);

CREATE INDEX IF NOT EXISTS idx_game_commands_pending
    ON game_commands (match_id, status)
    WHERE status IN ('PENDING', 'PROCESSING');

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. game_events — immutable append-only event log (source of truth for replay)
--    This is distinct from event_outbox which is purely a delivery mechanism.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS game_events (
    id              BIGSERIAL PRIMARY KEY,
    match_id        UUID        NOT NULL,
    sequence_number INTEGER     NOT NULL,
    event_type      VARCHAR(50) NOT NULL,
    payload         JSONB       NOT NULL DEFAULT '{}',
    user_id         UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_game_events_match_seq UNIQUE (match_id, sequence_number)
);

CREATE INDEX IF NOT EXISTS idx_game_events_match
    ON game_events (match_id, sequence_number ASC);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. event_outbox — delivery mechanism for downstream services (XP, analytics…)
--    NOT the replay event log. Outbox is at-least-once; consumers must be
--    idempotent.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS event_outbox (
    id              BIGSERIAL PRIMARY KEY,
    match_id        UUID        NOT NULL,
    event_type      VARCHAR(50) NOT NULL,
    payload         JSONB       NOT NULL DEFAULT '{}',
    status          VARCHAR(20) NOT NULL DEFAULT 'PENDING',
        -- PENDING | PROCESSING | PROCESSED | FAILED
    locked_at       TIMESTAMPTZ,
    attempt_count   INTEGER     NOT NULL DEFAULT 0,
    max_attempts    INTEGER     NOT NULL DEFAULT 5,
    next_retry_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_event_outbox_pending
    ON event_outbox (created_at)
    WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS idx_event_outbox_stale
    ON event_outbox (locked_at)
    WHERE status = 'PROCESSING';

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Augment game_matches with state-snapshot / revision columns for crash
--    recovery rehydration and checkpoint replay.
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE game_matches
    ADD COLUMN IF NOT EXISTS state_snapshot    JSONB,
    ADD COLUMN IF NOT EXISTS snapshot_revision INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS current_revision  INTEGER DEFAULT 0;

-- Backfill existing completed matches with finalState in metadata
UPDATE game_matches
SET state_snapshot    = metadata->'finalState',
    current_revision  = 0
WHERE state_snapshot IS NULL
  AND metadata->'finalState' IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Snapshot checkpoint strategy: periodically write a full snapshot and
--    reset the event window so recovery is cheap.
--    No extra table needed — game_matches.state_snapshot is the checkpoint;
--    game_events with sequence_number > snapshot_revision are the replay delta.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Resource limits table (configurable per-game, platform-enforced)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS game_engine_limits (
    game_id                     UUID PRIMARY KEY REFERENCES game(id) ON DELETE CASCADE,
    max_command_execution_ms    INTEGER NOT NULL DEFAULT 500,
    max_state_size_bytes        INTEGER NOT NULL DEFAULT 65536,
    max_event_payload_bytes     INTEGER NOT NULL DEFAULT 8192,
    max_events_per_second       INTEGER NOT NULL DEFAULT 20,
    max_commands_per_match      INTEGER NOT NULL DEFAULT 50000,
    max_players                 INTEGER NOT NULL DEFAULT 4,
    max_timers_per_match        INTEGER NOT NULL DEFAULT 16,
    max_chat_message_length     INTEGER NOT NULL DEFAULT 200,
    max_reconnects_per_minute   INTEGER NOT NULL DEFAULT 10,
    turn_timeout_ms             INTEGER NOT NULL DEFAULT 60000,
    reconnect_window_ms         INTEGER NOT NULL DEFAULT 60000,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default limits for existing games
INSERT INTO game_engine_limits (game_id)
SELECT id FROM game
ON CONFLICT (game_id) DO NOTHING;

COMMIT;
