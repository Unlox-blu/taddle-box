'use strict';

const pool = require('../../config/database');
const XpModel = require('./xp.model');

// XP

const create = async (userId, xp = 0) => {
  const { rows } = await pool.query(
    `
    INSERT INTO ${XpModel.TABLE} (user_id, xp, total_xp_earned)
    VALUES ($1, $2, $2)
    RETURNING ${XpModel.XP_FIELDS}
    `,
    [userId, xp]
  );
  return XpModel.formatXP(rows[0]);
};

const findByUserId = async (userId) => {
  const { rows } = await pool.query(
    `
    SELECT ${XpModel.XP_FIELDS}
    FROM ${XpModel.TABLE}
    WHERE user_id = $1
    `,
    [userId]
  );
  return XpModel.formatXP(rows[0]);
};

const incrementXp = async (userId, amount, client) => {
  const db = client || pool;
  const { rows } = await db.query(
    `
    UPDATE ${XpModel.TABLE}
    SET xp = xp + $2,
        total_xp_earned = total_xp_earned + $2,
        updated_at = NOW()
    WHERE user_id = $1
    RETURNING ${XpModel.XP_FIELDS}
    `,
    [userId, amount]
  );
  return XpModel.formatXP(rows[0]);
};

const decrementXp = async (userId, amount, client) => {
  const db = client || pool;
  const { rows } = await db.query(
    `
    UPDATE ${XpModel.TABLE}
    SET xp = GREATEST(0, xp - $2),
        updated_at = NOW()
    WHERE user_id = $1
    RETURNING ${XpModel.XP_FIELDS}
    `,
    [userId, amount]
  );
  return XpModel.formatXP(rows[0]);
};

// XP Transactions

const createTransaction = async (data, client) => {
  const db = client || pool;
  const { rows } = await db.query(
    `
    INSERT INTO ${XpModel.TRANSACTIONS_TABLE} AS xt (
    xp_id,
    xp,
    transaction_type,
    source_type,
    balance_before,
    balance_after,
    status
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING ${XpModel.TRANSACTION_FIELDS}
    `,
    [
    data.xpId,
    data.xp,
    data.transactionType,
    data.sourceType,
    data.balanceBefore,
    data.balanceAfter,
    data.status || 'completed',
  ]
  );
  return XpModel.formatTransaction(rows[0]);
};

const findTransactionById = async (id) => {
  const { rows } = await pool.query(
    `
    SELECT ${XpModel.TRANSACTION_FIELDS}
    FROM ${XpModel.TRANSACTIONS_TABLE} AS xt
    WHERE id = $1
    `,
    [id]
  );
  return XpModel.formatTransaction(rows[0]);
};

const getUserTransactions = async (xpId, limit, offset) => {
  const { rows } = await pool.query(
    `
    SELECT ${XpModel.TRANSACTION_FIELDS}, ${XpModel.GAME_ENRICH_FIELDS}
    FROM ${XpModel.TRANSACTIONS_TABLE} xt
    -- Resolve the game behind game XP entries so the wallet can name it:
    --   game_session_<sessionId>      -> game_sessions.id (via session id)
    --   game_match_<matchId>          -> game_match.id
    --   session_<slug> (entry fee)    -> game.slug
    LEFT JOIN game_sessions gs ON gs.id::text = split_part(xt.source_type, '_', 3)
        AND xt.source_type LIKE 'game_session_%'
    LEFT JOIN game_match gm ON gm.id::text = split_part(xt.source_type, '_', 3)
        AND xt.source_type LIKE 'game_match_%'
    LEFT JOIN game gsg ON gsg.id = COALESCE(gs.game_id, gm.game_id)
        OR (xt.source_type LIKE 'session_%' AND gsg.slug = split_part(xt.source_type, '_', 2))
    WHERE xt.xp_id = $1
    ORDER BY xt.created_at DESC
    LIMIT $2 OFFSET $3
    `,
    [xpId, limit, offset]
  );
  const totalRes = await pool.query(
    `SELECT COUNT(*) FROM ${XpModel.TRANSACTIONS_TABLE} WHERE xp_id = $1`,
    [xpId]
  );
  const total = parseInt(totalRes.rows[0].count, 10);
  return {rows: rows.map(XpModel.formatTransaction), total};
};

const getTransactionsBySource = async (xpId, sourceType) => {
  const { rows } = await pool.query(
    `
    SELECT ${XpModel.TRANSACTION_FIELDS}
    FROM ${XpModel.TRANSACTIONS_TABLE} AS xt
    WHERE xp_id = $1
    AND source_type = $2
    ORDER BY created_at DESC
    `,
    [xpId, sourceType]
  );

  return rows.map(XpModel.formatTransaction);
};

const checkRecentTransactionBySource = async (xpId, sourceType, hours) => {
  const { rows } = await pool.query(
    `
    SELECT id
    FROM ${XpModel.TRANSACTIONS_TABLE}
    WHERE xp_id = $1
    AND source_type = $2
    AND created_at >= NOW() - INTERVAL '1 hour' * $3
    LIMIT 1
    `,
    [xpId, sourceType, hours]
  );
  return rows.length > 0;
};

const checkDailyTransactionBySource = async (xpId, sourceType) => {
  const { rows } = await pool.query(
    `
    SELECT id
    FROM ${XpModel.TRANSACTIONS_TABLE}
    WHERE xp_id = $1
    AND source_type = $2
    LIMIT 1
    `,
    [xpId, sourceType]
  );
  return rows.length > 0;
};

const updateTransactionStatus = async (id, status) => {
  const { rows } = await pool.query(
    `
    UPDATE ${XpModel.TRANSACTIONS_TABLE} AS xt
    SET status = $2,
    updated_at = NOW()
    WHERE id = $1
    RETURNING ${XpModel.TRANSACTION_FIELDS}
    `,
    [id, status]
  );
  return XpModel.formatTransaction(rows[0]);
};

const getTransactionCount = async (userId) => {
  const { rows } = await pool.query(
    `
    SELECT COUNT(*)::INT AS count
    FROM ${XpModel.TRANSACTIONS_TABLE}
    WHERE user_id = $1
    `,
    [userId]
  );
  return rows[0].count;
};

module.exports = {
  create,
  findByUserId,
  incrementXp,
  decrementXp,
  createTransaction,
  findTransactionById,
  getUserTransactions,
  getTransactionsBySource,
  updateTransactionStatus,
  checkRecentTransactionBySource,
  checkDailyTransactionBySource,
  getTransactionCount,
};
