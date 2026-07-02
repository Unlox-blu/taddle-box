'use strict';

const TABLE = 'app_config';

const LIST_FIELDS = [
    'id', 'latest_version', 'minimum_version', 'store_url', 'created_at', 'updated_at'
].join(', ');

const format = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    latestVersion: row.latest_version,
    minimumVersion: row.minimum_version,
    storeUrl: row.store_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

module.exports = { TABLE, LIST_FIELDS, format };
