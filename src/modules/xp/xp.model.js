'use strict';

const TABLE = 'xp';
const TRANSACTIONS_TABLE = 'xp_transactions';

const XP_FIELDS = [
  'id', 'user_id', 'xp', 'total_xp_earned', 'created_at', 'updated_at',
].join(', ');

const TRANSACTION_FIELDS = [
  'xt.id', 'xt.xp_id', 'xt.xp', 'xt.transaction_type', 'xt.source_type',
  'xt.balance_before', 'xt.balance_after', 'xt.status', 'xt.created_at', 'xt.updated_at',
].join(', ');

// Game-name enrichment columns — used ONLY by getUserTransactions, which is
// the sole query that LEFT-JOINs the game tables. Kept apart from
// TRANSACTION_FIELDS so plain INSERT/UPDATE ... RETURNING and single-table
// SELECTs (which reference TRANSACTION_FIELDS) never need the game joins.
const GAME_ENRICH_FIELDS = [
  'gsg.slug AS game_slug',
  'gsg.name AS game_name',
].join(', ');

const TRANSACTION_TYPES = ['earned', 'spent', 'bonus'];
const TRANSACTION_STATUSES = ['pending', 'completed', 'failed'];

const formatXP = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    Xp: row.xp,
    totalXpEarned: row.total_xp_earned,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

const formatTransaction = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    xpId: row.xp_id,
    xp: row.xp,
    transactionType: row.transaction_type,
    sourceType: row.source_type,
    gameSlug: row.game_slug || null,
    gameName: row.game_name || null,
    balanceBefore: row.balance_before,
    balanceAfter: row.balance_after,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

module.exports = {
  TABLE, TRANSACTIONS_TABLE,
  XP_FIELDS, TRANSACTION_FIELDS, GAME_ENRICH_FIELDS,
  TRANSACTION_TYPES, TRANSACTION_STATUSES,
  formatXP, formatTransaction,
};
