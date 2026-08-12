-- 045: Normalize legacy match mode labels to the canonical uppercase set.
--
-- game_match.mode is already constrained to AUTO/CUSTOM/TOURNAMENT (migration
-- 044), but rows written before that — plus jsonb metadata and the engine table
-- (game_matches.mode has NO CHECK constraint) — can still carry legacy labels
-- (BOT, QUICK, INVITE) or lowercase variants (bot, quick, custom, ...).
-- This migration relabels every existing row so the history view and match
-- summaries never surface legacy mode names again.
--
-- Idempotent: re-running is a no-op once the data is canonical.
--
-- NOTE on BOT/INVITE → CUSTOM: this deliberately follows migration 044's
-- precedent (game_match.mode BOT → CUSTOM). The runtime helper
-- normalizeMatchMode() now defaults any unknown/legacy mode to 'AUTO', but that
-- only affects NEW writes (which are always canonical anyway); for historical
-- rows we keep the 044 mapping so game_match, game_matches and game_sessions
-- all tell the same story. The history view only reads game_match.mode, so
-- this is data hygiene, not user-visible behavior.

-- 1) game_match.mode column (idempotent; also catches lowercase stragglers)
UPDATE game_match
SET mode = CASE
  WHEN UPPER(mode) = 'QUICK'   THEN 'AUTO'
  WHEN UPPER(mode) IN ('BOT', 'INVITE') THEN 'CUSTOM'
  ELSE UPPER(mode)
END
WHERE mode <> UPPER(mode) OR UPPER(mode) IN ('QUICK', 'BOT', 'INVITE');

-- 2) game_match.metadata->>'gameMode' — jsonb mirror of the mode used by the
--    matchmaking placeholder rows. Relabel to the canonical value.
UPDATE game_match
SET metadata = jsonb_set(metadata, '{gameMode}', to_jsonb(
  CASE UPPER(metadata->>'gameMode')
    WHEN 'QUICK'   THEN 'AUTO'
    WHEN 'BOT'     THEN 'CUSTOM'
    WHEN 'INVITE'  THEN 'CUSTOM'
    ELSE UPPER(metadata->>'gameMode')
  END
))
WHERE metadata ? 'gameMode'
  AND (
    UPPER(metadata->>'gameMode') IN ('QUICK', 'BOT', 'INVITE')
    OR metadata->>'gameMode' <> UPPER(metadata->>'gameMode')
  );

-- 3) game_matches.mode (engine table) — column has no CHECK constraint, which is
--    how legacy values crept in. Relabel existing rows, then enforce the same
--    canonical set as game_match going forward.
UPDATE game_matches
SET mode = CASE
  WHEN UPPER(mode) = 'QUICK'   THEN 'AUTO'
  WHEN UPPER(mode) IN ('BOT', 'INVITE') THEN 'CUSTOM'
  ELSE UPPER(mode)
END
WHERE mode <> UPPER(mode) OR UPPER(mode) IN ('QUICK', 'BOT', 'INVITE');

ALTER TABLE game_matches
  DROP CONSTRAINT IF EXISTS game_matches_mode_check;

ALTER TABLE game_matches
  ADD CONSTRAINT game_matches_mode_check CHECK (mode IN ('AUTO', 'CUSTOM', 'TOURNAMENT'));

-- 4) game_sessions.metadata->>'mode' — feeds completeGameSession and the
--    resolution job, which pass it to recordMatchHistory. Relabel so no legacy
--    label can propagate from session data.
UPDATE game_sessions
SET metadata = jsonb_set(metadata, '{mode}', to_jsonb(
  CASE UPPER(metadata->>'mode')
    WHEN 'QUICK'   THEN 'AUTO'
    WHEN 'BOT'     THEN 'CUSTOM'
    WHEN 'INVITE'  THEN 'CUSTOM'
    ELSE UPPER(metadata->>'mode')
  END
))
WHERE metadata ? 'mode'
  AND (
    UPPER(metadata->>'mode') IN ('QUICK', 'BOT', 'INVITE')
    OR metadata->>'mode' <> UPPER(metadata->>'mode')
  );
