-- push.repository.js upserts with `ON CONFLICT (user_id, token) DO UPDATE`,
-- which requires a unique constraint on that pair — without it every
-- POST /push/register 500s and tokens never persist. Dedupe any existing
-- duplicates (keep the newest per user+token) before adding the constraint.

DELETE FROM device_notification
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY user_id, token
             ORDER BY created_at DESC, id DESC
           ) AS rn
    FROM device_notification
  ) ranked
  WHERE rn > 1
);

ALTER TABLE device_notification
  ADD CONSTRAINT device_notification_user_token_key UNIQUE (user_id, token);
