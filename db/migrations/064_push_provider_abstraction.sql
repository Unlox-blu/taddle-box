-- Push provider abstraction: device-centric token storage.
-- Adds device_id (stable per-installation UUID), push_provider ('expo' | 'fcm' | …),
-- and is_active.  Renames token → push_token for clarity.
--
-- Backfill: generates unique device_ids even when a user has multiple rows
-- for the same platform (e.g. two Android tokens from reinstalling), then
-- deduplicates by keeping only the newest row per user+device_id.

-- 1. Add new columns (nullable initially)
ALTER TABLE device_notification ADD COLUMN device_id     VARCHAR(128);
ALTER TABLE device_notification ADD COLUMN push_provider VARCHAR(20) DEFAULT 'expo';
ALTER TABLE device_notification ADD COLUMN is_active     BOOLEAN DEFAULT TRUE;

-- 2. Backfill device_id with a UNIQUE value per existing row.
--    Uses ROW_NUMBER() over (user_id, platform, created_at) so even if a
--    user has 3 Android tokens, each gets a distinct device_id like
--    'legacy-user123-android-1', 'legacy-user123-android-2', etc.
UPDATE device_notification dn
SET device_id = sub.legacy_id
FROM (
  SELECT id,
    'legacy-' || user_id || '-' || COALESCE(platform, 'unknown') || '-' ||
    ROW_NUMBER() OVER (
      PARTITION BY user_id, platform
      ORDER BY created_at DESC, id DESC
    ) AS legacy_id
  FROM device_notification
) sub
WHERE dn.id = sub.id
  AND dn.device_id IS NULL;

-- 3. Deduplicate: keep only the newest row per (user_id, device_id).
DELETE FROM device_notification
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY user_id, device_id
        ORDER BY created_at DESC, id DESC
      ) AS rn
    FROM device_notification
  ) ranked
  WHERE rn > 1
);

-- 4. Make device_id NOT NULL after backfill
ALTER TABLE device_notification ALTER COLUMN device_id SET NOT NULL;

-- 5. Rename token → push_token for clarity
ALTER TABLE device_notification RENAME COLUMN token TO push_token;

-- 6. Drop old unique constraint, add device-centric one
ALTER TABLE device_notification DROP CONSTRAINT IF EXISTS device_notification_user_token_key;
ALTER TABLE device_notification DROP CONSTRAINT IF EXISTS device_notification_user_device;
ALTER TABLE device_notification
  ADD CONSTRAINT device_notification_user_device UNIQUE (user_id, device_id);

-- 7. Index for the send query (active + enabled devices per user)
CREATE INDEX IF NOT EXISTS idx_device_notification_active
  ON device_notification(user_id)
  WHERE is_active = TRUE AND notifications_enabled = TRUE;
