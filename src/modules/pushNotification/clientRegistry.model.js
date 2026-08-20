'use strict';

const TABLE = 'client_registry';const LIST_FIELDS = [
  'id', 'device_id', 'user_id', 'session_id',
  'refresh_hash', 'session_expires_at', 'revoked_at',
  'push_token', 'push_provider', 'platform',
  'is_active', 'notifications_enabled', 'app_version', 'os_version', 'last_seen_at',
  'created_at', 'updated_at',
].join(', ');

const format = (row) => ({
  id: row.id,
  deviceId: row.device_id,
  userId: row.user_id,
  sessionId: row.session_id,
  refreshHash: row.refresh_hash,
  sessionExpiresAt: row.session_expires_at,
  revokedAt: row.revoked_at,
  pushToken: row.push_token,
  pushProvider: row.push_provider,
  platform: row.platform,
  isActive: row.is_active,
  notificationsEnabled: row.notifications_enabled,
  appVersion: row.app_version,
  osVersion: row.os_version,
  lastSeenAt: row.last_seen_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

module.exports = { TABLE, LIST_FIELDS, format };
