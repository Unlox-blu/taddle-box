-- NEW_POST preference: controls whether a user receives "X posted a new post /
-- reposted a post" fan-out notifications from people they follow. Defaults to
-- TRUE; users without a preferences row are treated as opted-in (NULL = TRUE).
ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS new_post BOOLEAN NOT NULL DEFAULT TRUE;
