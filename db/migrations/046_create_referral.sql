-- Refer & Earn: add per-user referral code + referrer link
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS referral_code VARCHAR(12) UNIQUE,
  ADD COLUMN IF NOT EXISTS referred_by    UUID REFERENCES users(id) ON DELETE SET NULL;

-- Backfill existing users with a guaranteed-unique code derived from their
-- creation order (row_number -> hex), so the UNIQUE constraint can never trip.
WITH numbered AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn
  FROM users
  WHERE referral_code IS NULL
)
UPDATE users u
SET referral_code = 'TDL' || UPPER(LPAD(TO_HEX(n.rn), 6, '0'))
FROM numbered n
WHERE u.id = n.id;

-- Index for fast code lookup
CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code);
CREATE INDEX IF NOT EXISTS idx_users_referred_by   ON users(referred_by);
