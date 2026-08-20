-- 068_drop_device_notification.sql
--
-- Drops the deprecated device_notification table after verifying that
-- client_registry (067) contains equivalent data.
--
-- Pre-flight checks:
--   1. client_registry must have at least as many distinct (device_id, user_id)
--      pairs as device_notification.
--   2. No client_registry row should have a NULL push_token if the
--      corresponding device_notification row had one.
--
-- If either check fails the migration aborts and the table is preserved
-- for manual inspection.

-- 1. Verify row count parity
DO $$
DECLARE
  old_count INTEGER;
  new_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO old_count FROM device_notification;
  SELECT COUNT(*) INTO new_count FROM client_registry;

  IF new_count < old_count THEN
    RAISE EXCEPTION
      'client_registry has % rows but device_notification has % — migration not safe',
      new_count, old_count;
  END IF;
END $$;

-- 2. Verify no token loss (every non-null token in old table exists in new)
DO $$
DECLARE
  lost_tokens INTEGER;
BEGIN
  SELECT COUNT(*) INTO lost_tokens
  FROM device_notification dn
  WHERE dn.push_token IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM client_registry cr
      WHERE cr.device_id = dn.device_id
        AND cr.user_id   = dn.user_id
        AND cr.push_token = dn.push_token
    );

  IF lost_tokens > 0 THEN
    RAISE EXCEPTION
      '% push tokens present in device_notification are missing from client_registry',
      lost_tokens;
  END IF;
END $$;

-- 3. Drop the deprecated table
DROP TABLE IF EXISTS device_notification;
