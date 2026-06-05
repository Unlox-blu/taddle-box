'use strict';

const pool = require('../config/database');
const WalletModel = require('../models/wallet.model');

const findByUserId = async (userId) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${WalletModel.WALLET_FIELDS} FROM ${WalletModel.TABLE} WHERE user_id = $1`,
      [userId]
    );
    return rows[0] || null;
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
    return rows[0];
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
    return rows[0] || null;
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
    return rows[0];
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
    return rows[0];
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
    return rows[0];
  } catch (error) {
    throw error;
  }
};

const getTransactions = async (walletId, limit, offset) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${WalletModel.TRANSACTION_FIELDS}, COUNT(*) OVER() AS total
     FROM ${WalletModel.TRANSACTIONS_TABLE}
     WHERE wallet_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [walletId, limit, offset]
    );
    const total = rows[0]?.total || 0;
    return { rows, total: parseInt(total, 10) };
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
    return rows[0] || null;
  } catch (error) {
    throw error;
  }
};

module.exports = {
  findByUserId,
  create,
  lockForUpdate,
  creditBalance,
  debitBalance,
  createTransaction,
  getTransactions,
  findTransactionByRazorpayOrderId,
};
