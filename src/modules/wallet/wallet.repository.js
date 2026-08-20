'use strict';

const pool = require('../../config/database');
const WalletModel = require('./wallet.model');

const findByUserId = async (userId) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${WalletModel.WALLET_FIELDS} 
      FROM ${WalletModel.TABLE} 
      WHERE user_id = $1`,
      [userId]
    );
    return rows[0] ? WalletModel.formatWallet(rows[0]) : null;
  } catch (error) {
    throw error;
  }
};

const findById = async (walletId) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${WalletModel.WALLET_FIELDS}, user_id
      FROM ${WalletModel.TABLE}
      WHERE id = $1`,
      [walletId]
    );
    return rows[0] ? WalletModel.formatWallet(rows[0]) : null;
  } catch (error) {
    throw error;
  }
};

const create = async (userId) => {
  try {
    const { rows } = await pool.query(
      `INSERT INTO ${WalletModel.TABLE} (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING RETURNING ${WalletModel.WALLET_FIELDS}`,
      [userId]
    );
    return WalletModel.formatWallet(rows[0]);
  } catch (error) {
    throw error;
  }
};

const updateUPI = async (userId, upiId) => {
  try {
    const { rows } = await pool.query(
      `UPDATE ${WalletModel.TABLE} SET linked_upi = $1, updated_at = NOW() WHERE user_id = $2 RETURNING ${WalletModel.WALLET_FIELDS}`,
      [upiId, userId]
    );
    return rows[0] ? WalletModel.formatWallet(rows[0]) : null;
  } catch (error) {
    throw error;
  }
};

// Must be called inside a transaction (pass pg client)
const lockForUpdate = async (walletId, client) => {
  try {
    const { rows } = await client.query(
      `SELECT * FROM ${WalletModel.TABLE} WHERE id = $1 FOR UPDATE`,
      [walletId]
    );
    return rows[0] ? WalletModel.formatWallet(rows[0]) : null;
  } catch (error) {
    throw error;
  }
};

const creditBalance = async (walletId, amountCents, client) => {
  try {
    const db = client || pool;
    const { rows } = await db.query(
      `UPDATE ${WalletModel.TABLE} SET balance_cents = balance_cents + $1, updated_at = NOW()
     WHERE id = $2 RETURNING balance_cents`,
      [amountCents, walletId]
    );
    return WalletModel.formatWallet(rows[0]);
  } catch (error) {
    throw error;
  }
};

const debitBalance = async (walletId, amountCents, client) => {
  try {
    const db = client || pool;
    const { rows } = await db.query(
      `UPDATE ${WalletModel.TABLE} SET balance_cents = balance_cents - $1, updated_at = NOW()
     WHERE id = $2 AND balance_cents >= $1 RETURNING balance_cents`,
      [amountCents, walletId]
    );
    if (!rows[0]) throw new Error('Insufficient wallet balance');
    return WalletModel.formatWallet(rows[0]);
  } catch (error) {
    throw error;
  }
};

const holdBalance = async (walletId, amountCents, client) => {
  try {
    const db = client || pool;
    const { rows } = await db.query(
      `UPDATE ${WalletModel.TABLE} 
       SET balance_cents = balance_cents - $1, 
           held_balance_cents = held_balance_cents + $1, 
           updated_at = NOW()
       WHERE id = $2 AND balance_cents >= $1 RETURNING balance_cents`,
      [amountCents, walletId]
    );
    if (!rows[0]) throw new Error('Insufficient wallet balance');
    return WalletModel.formatWallet(rows[0]);
  } catch (error) {
    throw error;
  }
};

const releaseHoldBalance = async (walletId, amountCents, client) => {
  try {
    const db = client || pool;
    const { rows } = await db.query(
      `UPDATE ${WalletModel.TABLE} 
       SET held_balance_cents = held_balance_cents - $1, 
           updated_at = NOW()
       WHERE id = $2 RETURNING balance_cents`,
      [amountCents, walletId]
    );
    return WalletModel.formatWallet(rows[0]);
  } catch (error) {
    throw error;
  }
};

const createTransaction = async (data, client) => {
  try {
    const db = client || pool;
    const { rows } = await db.query(
      `INSERT INTO ${WalletModel.TRANSACTIONS_TABLE}
       (wallet_id, type, amount_cents, balance_after_cents, description, category, razorpay_order_id, razorpay_payment_id, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING ${WalletModel.TRANSACTION_FIELDS}`,
      [
        data.walletId,
        data.type,
        data.amountCents,
        data.balanceAfterCents,
        data.description || null,
        data.category || 'topup',
        data.razorpayOrderId || null,
        data.razorpayPaymentId || null,
        data.status || 'completed',
      ]
    );
    return WalletModel.formatTransaction(rows[0]);
  } catch (error) {
    throw error;
  }
};

// `q` searches the FULL transaction history server-side (description, type,
// category, status, amount) so wallet search isn't limited to the first page.
const getTransactions = async (walletId, limit, offset, q = '', timeCutoff = null, sort = 'latest') => {
  try {
    const search = String(q || '').trim();
    const { rows } = await pool.query(
      `SELECT ${WalletModel.TRANSACTION_FIELDS}, COUNT(*) OVER() AS total
     FROM ${WalletModel.TRANSACTIONS_TABLE}
     WHERE wallet_id = $1
       AND (
         $4 = ''
         OR description ILIKE '%' || $4 || '%'
         OR type ILIKE '%' || $4 || '%'
         OR category ILIKE '%' || $4 || '%'
         OR status ILIKE '%' || $4 || '%'
         OR amount_cents::text LIKE '%' || $4 || '%'
       )
       -- Time-window filter ($5 = cutoff timestamp; null = all time).
       AND ($5::timestamptz IS NULL OR created_at >= $5)
     ORDER BY
       -- Sort ($6): 'top' = biggest amount first (mirrors the app's local
       -- sort); every other value stays newest-first.
       CASE WHEN $6 = 'top' THEN ABS(amount_cents) END DESC,
       created_at DESC LIMIT $2 OFFSET $3`,
      [walletId, limit, offset, search, timeCutoff, sort]
    );
    const total = rows[0]?.total || 0;
    const transactions = rows.map(WalletModel.formatTransaction)
    return { transactions, total: parseInt(total, 10) };
  } catch (error) {
    throw error;
  }
};

const findTransactionByRazorpayOrderId = async (orderId) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM ${WalletModel.TRANSACTIONS_TABLE} WHERE razorpay_order_id = $1`,
      [orderId]
    );
    return rows[0] ? WalletModel.formatTransaction(rows[0]) : null;
  } catch (error) {
    throw error;
  }
};

const getWalletStats = async (walletId) => {
  try {
    const { rows } = await pool.query(
      `SELECT 
         COALESCE(SUM(CASE WHEN type = 'credit' THEN amount_cents ELSE 0 END), 0) AS total_earned,
         COALESCE(SUM(CASE WHEN category = 'withdrawal' AND status != 'failed' THEN amount_cents ELSE 0 END), 0) AS total_withdrawn
       FROM ${WalletModel.TRANSACTIONS_TABLE}
       WHERE wallet_id = $1`,
      [walletId]
    );
    return {
      totalEarnedCents: parseInt(rows[0]?.total_earned || 0, 10),
      totalWithdrawnCents: parseInt(rows[0]?.total_withdrawn || 0, 10)
    };
  } catch (error) {
    throw error;
  }
};

module.exports = {
  findByUserId,
  findById,
  create,
  updateUPI,
  lockForUpdate,
  creditBalance,
  debitBalance,
  holdBalance,
  releaseHoldBalance,
  createTransaction,
  getTransactions,
  findTransactionByRazorpayOrderId,
  getWalletStats,
};
