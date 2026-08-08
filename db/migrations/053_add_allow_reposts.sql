-- "Allow Reposting" privacy toggle: when OFF, nobody can repost this user's
-- posts. Existing reposts stay, new ones are blocked (server-enforced in
-- repostPost and hidden in the UI via author_reposts_enabled).
ALTER TABLE settings ADD COLUMN IF NOT EXISTS allow_reposts BOOLEAN NOT NULL DEFAULT TRUE;
