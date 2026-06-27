'use strict';

const TABLE = 'active_status';

const LIST_FIELDS = [
    'id', 'user_id', 'is_active', 'last_seen', 'created_at', 'updated_at'
].join(', ');

const format = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    isActive: row.is_active,
    lastSeen: row.last_seen,
    userId: row.user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

module.exports = { TABLE, LIST_FIELDS, format };
