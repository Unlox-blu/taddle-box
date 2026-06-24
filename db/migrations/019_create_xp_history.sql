CREATE TABLE IF NOT EXISTS xp_transactions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    xp              INT NOT NULL,
    transaction_type VARCHAR(20) NOT NULL
                        CHECK (transaction_type IN ('earned', 'spent', 'bonus')),
    source_type     VARCHAR(50) NOT NULL,
    balance_before  INT NOT NULL,
    balance_after   INT NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'completed'
                        CHECK (status IN ('pending', 'completed', 'failed')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);