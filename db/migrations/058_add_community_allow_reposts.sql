-- Community-level \"Allow Reposting\" toggle: when OFF, nobody can create NEW
-- reposts of posts published in this community (server-enforced in
-- repostPost, hidden in the UI via community.repostsEnabled on every post
-- card surface). Existing reposts stay. Owned/toggled by the community owner.

ALTER TABLE communities ADD COLUMN IF NOT EXISTS allow_reposts BOOLEAN NOT NULL DEFAULT TRUE;
