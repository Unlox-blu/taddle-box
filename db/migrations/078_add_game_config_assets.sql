-- Migration: Add config + assets to game table
-- Date: 2026-08-24
-- Backend-controlled game configuration and asset manifests.

BEGIN;

ALTER TABLE game ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}';
ALTER TABLE game ADD COLUMN IF NOT EXISTS assets JSONB DEFAULT '{}';

-- Backfill config per-game (individual statements to avoid CASE + JSONB parser issues)
UPDATE game SET config = '{"board":{"type":"grid-board","rows":8,"columns":8},"pieces":{"count":16,"shape":"custom"},"dice":{"enabled":false},"timers":{"turn":600000}}'::jsonb WHERE slug = 'chess';
UPDATE game SET config = '{"board":{"type":"path-board","rows":15,"columns":15},"pieces":{"count":4,"shape":"circle"},"dice":{"enabled":true,"faces":6},"timers":{"turn":30000}}'::jsonb WHERE slug = 'ludo';
UPDATE game SET config = '{"board":{"type":"grid-board","rows":10,"columns":10},"pieces":{"count":1,"shape":"circle"},"dice":{"enabled":true,"faces":6},"timers":{"turn":12000}}'::jsonb WHERE slug = 'snake-ladder';
UPDATE game SET config = '{"board":{"type":"custom"},"pieces":{"count":0,"shape":"custom"},"dice":{"enabled":false},"timers":{"round":80000}}'::jsonb WHERE slug = 'scribble';
UPDATE game SET config = '{"board":{"type":"custom"},"pieces":{"count":0,"shape":"custom"},"dice":{"enabled":false},"timers":{"round":90000}}'::jsonb WHERE slug = 'word-rush';
UPDATE game SET config = '{"board":{"type":"custom"},"pieces":{"count":0,"shape":"custom"},"dice":{"enabled":false},"timers":{"game":20000}}'::jsonb WHERE slug = 'tap-rush';
UPDATE game SET config = '{"board":{"type":"grid-board","rows":4,"columns":4},"pieces":{"count":0,"shape":"custom"},"dice":{"enabled":false},"timers":{"round":30000}}'::jsonb WHERE slug = 'memory-grid';

-- Backfill assets placeholder (real CDN URLs added when assets are uploaded)
UPDATE game SET assets = '{"version":1,"baseUrl":"https://cdn.taddlebox.com/games/","items":{}}'::jsonb
WHERE assets IS NULL OR assets = '{}'::jsonb;

COMMIT;
