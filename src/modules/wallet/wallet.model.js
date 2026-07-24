'use strict';

const TABLE = 'wallets';
const TRANSACTIONS_TABLE = 'transactions';

const WALLET_FIELDS = [
  'id', 'user_id', 'balance_cents', 'held_balance_cents', 'currency', 'is_active', 'linked_upi', 'updated_at',
].join(', ');

const TRANSACTION_FIELDS = [
  'id', 'wallet_id', 'type', 'amount_cents', 'balance_after_cents',
  'description', 'category', 'razorpay_order_id', 'razorpay_payment_id',
  'status', 'created_at',
].join(', ');

const TRANSACTION_TYPES = ['credit', 'debit'];
const TRANSACTION_CATEGORIES = ['topup', 'event_ticket', 'refund', 'withdrawal'];
const TRANSACTION_STATUSES = ['pending', 'completed', 'failed', 'refunded'];

const formatWallet = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    balanceCents: row.balance_cents,
    heldBalanceCents: row.held_balance_cents,
    currency: row.currency,
    isActive: row.is_active,
    linkedUpi: row.linked_upi,
    updatedAt: row.updated_at,
  };
};

const formatTransaction = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    type: row.type,
    amountCents: row.amount_cents,
    balanceAfterCents: row.balance_after_cents,
    description: row.description,
    category: row.category,
    status: row.status,
    createdAt: row.created_at,
  };
};

module.exports = {
  TABLE, TRANSACTIONS_TABLE,
  WALLET_FIELDS, TRANSACTION_FIELDS,
  TRANSACTION_TYPES, TRANSACTION_CATEGORIES, TRANSACTION_STATUSES,
  formatWallet, formatTransaction,
};
