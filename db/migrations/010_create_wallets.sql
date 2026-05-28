-- 010_create_wallets.sql
CREATE TABLE IF NOT EXISTS wallets (
  id            UUID    PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID    NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  balance_cents INTEGER NOT NULL DEFAULT 0 CHECK (balance_cents >= 0),
  currency      CHAR(3) NOT NULL DEFAULT 'INR',
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transactions (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_id            UUID        NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  type                 VARCHAR(10) NOT NULL CHECK (type IN ('credit','debit')),
  amount_cents         INTEGER     NOT NULL CHECK (amount_cents > 0),
  balance_after_cents  INTEGER     NOT NULL CHECK (balance_after_cents >= 0),
  description          TEXT,
  category             VARCHAR(30) NOT NULL DEFAULT 'topup'
                         CHECK (category IN ('topup','event_ticket','refund','withdrawal','system')),
  razorpay_order_id    TEXT,
  razorpay_payment_id  TEXT,
  status               VARCHAR(20) NOT NULL DEFAULT 'completed'
                         CHECK (status IN ('pending','completed','failed','refunded')),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
