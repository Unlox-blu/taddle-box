-- Streak restore window: while set, the streak is frozen and can be revived
-- by paying XP before this deadline. NULL means no restore is currently open.
ALTER TABLE streak ADD COLUMN IF NOT EXISTS restore_deadline TIMESTAMPTZ;

-- Highest streak day this row has already been rewarded for (7, 14, 21, ...).
-- Reset rows start at 0 so each new streak can earn every milestone again.
ALTER TABLE streak ADD COLUMN IF NOT EXISTS last_rewarded_day INT NOT NULL DEFAULT 0;
