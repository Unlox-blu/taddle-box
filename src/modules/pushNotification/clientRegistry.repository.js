'use strict';

const pool = require('../../config/database');
const ClientRegistryModel = require('./clientRegistry.model');

/**
 * Upserts a device registration.  The natural key is (device_id, user_id) —
 * one row per account per installation.  When the same user re-registers on
 * the same device, the existing row is updated.
 */
const create = async ({ userId, deviceId, sessionId, pushToken, pushProvider, platform, appVersion, osVersion }) => {
  try {
    const { rows } = await pool.query(
      `INSERT INTO ${ClientRegistryModel.TABLE}
         (user_id, device_id, session_id, push_token, push_provider, platform, app_version, os_version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (device_id, user_id) DO UPDATE SET
         session_id    = EXCLUDED.session_id,
         push_token    = EXCLUDED.push_token,
         push_provider = EXCLUDED.push_provider,
         platform      = EXCLUDED.platform,
         app_version   = EXCLUDED.app_version,
         os_version    = EXCLUDED.os_version,
         is_active     = TRUE,
         last_seen_at  = NOW(),
         updated_at    = NOW()
       RETURNING ${ClientRegistryModel.LIST_FIELDS}`,
      [userId, deviceId, sessionId, pushToken, pushProvider, platform, appVersion, osVersion]
    );
    return ClientRegistryModel.format(rows[0]);
  } catch (error) {
    throw error;
  }
};

/**
 * Toggles the notifications_enabled flag for a specific device/user pair.
 */
const toggleNotification = async ({ userId, deviceId }) => {
  try {
    const { rows } = await pool.query(
      `UPDATE ${ClientRegistryModel.TABLE}
       SET notifications_enabled = NOT notifications_enabled,
           updated_at = NOW()
       WHERE user_id = $1 AND device_id = $2
       RETURNING ${ClientRegistryModel.LIST_FIELDS}`,
      [userId, deviceId]
    );
    return ClientRegistryModel.format(rows[0]);
  } catch (error) {
    throw error;
  }
};

/**
 * Finds all active, enabled devices for a user, deduped by device_id.
 * Returns the most recently updated row per device (device-wide push token).
 */
const findByUser = async (userId) => {
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT ON (device_id) ${ClientRegistryModel.LIST_FIELDS}
       FROM ${ClientRegistryModel.TABLE}
       WHERE user_id = $1
         AND is_active = TRUE
         AND notifications_enabled = TRUE
         AND push_token IS NOT NULL
       ORDER BY device_id, updated_at DESC`,
      [userId]
    );
    return rows.map(ClientRegistryModel.format);
  } catch (error) {
    throw error;
  }
};

/**
 * Verifies that a user has a registered row for a given device.
 * Returns the registration row if found, null otherwise.
 * Used for ownership verification on device-wide token updates.
 */
const findByDeviceAndUser = async ({ deviceId, userId }) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${ClientRegistryModel.LIST_FIELDS}
       FROM ${ClientRegistryModel.TABLE}
       WHERE device_id = $1 AND user_id = $2 AND is_active = TRUE`,
      [deviceId, userId]
    );
    return rows[0] ? ClientRegistryModel.format(rows[0]) : null;
  } catch (error) {
    throw error;
  }
};

/**
 * Device-wide push token update: updates ALL rows for a device_id.
 *
 * Ownership verification is handled upstream (middleware or caller).
 * This query intentionally preserves each user's notifications_enabled
 * preference — it only touches push_token, push_provider, and updated_at.
 */
const updateDevicePushToken = async ({ deviceId, pushToken, pushProvider }) => {
  try {
    const { rowCount } = await pool.query(
      `UPDATE ${ClientRegistryModel.TABLE}
       SET push_token    = $2,
           push_provider = COALESCE($3, push_provider),
           updated_at    = NOW()
       WHERE device_id = $1 AND is_active = TRUE`,
      [deviceId, pushToken, pushProvider]
    );
    return rowCount;
  } catch (error) {
    throw error;
  }
};

/**
 * Removes device records by push_token value (used for dead-token pruning).
 */
const deleteTokens = async (tokens) => {
  try {
    if (!tokens || !tokens.length) return;
    await pool.query(
      `DELETE FROM ${ClientRegistryModel.TABLE} WHERE push_token = ANY($1::text[])`,
      [tokens]
    );
  } catch (_error) {
    // Best-effort.
  }
};

/**
 * Removes ALL device records for a user (e.g. on logout).
 */
const deleteByUser = async (userId) => {
  try {
    await pool.query(
      `DELETE FROM ${ClientRegistryModel.TABLE} WHERE user_id = $1`,
      [userId]
    );
  } catch (_error) {
    // Best-effort — never break logout because of token cleanup.
  }
};

// ── Auth Session Methods ───────────────────────────────────────────────────

/**
 * Upserts an auth session for a (device_id, user_id) pair.
 * Returns the full client_registry row with refresh_hash.
 */
const upsertSession = async ({ userId, deviceId, sessionId, refreshHash, sessionExpiresAt, pushToken, pushProvider, platform }) => {
  try {
    const { rows } = await pool.query(
      `INSERT INTO ${ClientRegistryModel.TABLE}
         (user_id, device_id, session_id, refresh_hash, session_expires_at,
          push_token, push_provider, platform)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (device_id, user_id) DO UPDATE SET
         session_id        = EXCLUDED.session_id,
         refresh_hash      = EXCLUDED.refresh_hash,
         session_expires_at = EXCLUDED.session_expires_at,
         revoked_at        = NULL,
         push_token        = COALESCE(EXCLUDED.push_token, client_registry.push_token),
         push_provider     = COALESCE(EXCLUDED.push_provider, client_registry.push_provider),
         platform          = COALESCE(EXCLUDED.platform, client_registry.platform),
         is_active         = TRUE,
         last_seen_at      = NOW(),
         updated_at        = NOW()
       RETURNING ${ClientRegistryModel.LIST_FIELDS}`,
      [userId, deviceId, sessionId, refreshHash, sessionExpiresAt, pushToken || null, pushProvider || 'expo', platform || null]
    );
    return ClientRegistryModel.format(rows[0]);
  } catch (error) {
    throw error;
  }
};

/**
 * Finds an active (non-revoked, non-expired) session by session_id.
 * Used during refresh token rotation.
 */
const findActiveSession = async ({ sessionId }) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${ClientRegistryModel.LIST_FIELDS}
       FROM ${ClientRegistryModel.TABLE}
       WHERE session_id = $1
         AND revoked_at IS NULL
         AND is_active = TRUE`,
      [sessionId]
    );
    return rows[0] ? ClientRegistryModel.format(rows[0]) : null;
  } catch (error) {
    throw error;
  }
};

/**
 * Revokes a single session by session_id (device-specific logout).
 */
const revokeSession = async ({ sessionId }) => {
  try {
    await pool.query(
      `UPDATE ${ClientRegistryModel.TABLE}
       SET revoked_at = NOW(), updated_at = NOW()
       WHERE session_id = $1 AND revoked_at IS NULL`,
      [sessionId]
    );
  } catch (_error) {
    // Best-effort
  }
};

/**
 * Revokes ALL sessions for a user (full logout).
 */
const revokeAllSessions = async ({ userId }) => {
  try {
    await pool.query(
      `UPDATE ${ClientRegistryModel.TABLE}
       SET revoked_at = NOW(), updated_at = NOW()
       WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId]
    );
  } catch (_error) {
    // Best-effort
  }
};

/**
 * Returns all distinct device_ids for a user (active or revoked).
 * Used by the device socket to know which devices to notify on session revocation.
 */
const findDeviceIdsByUser = async (userId) => {
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT device_id FROM ${ClientRegistryModel.TABLE}
       WHERE user_id = $1`,
      [userId]
    );
    return rows.map((r) => r.device_id);
  } catch (_error) {
    return [];
  }
};

/**
 * Batch-validates sessions by session_id.
 * Returns all active (non-revoked) rows matching the given session IDs.
 * Used by the foreground validation to check stored accounts in one query.
 */
const findActiveSessionsBySessionIds = async (sessionIds) => {
  if (!sessionIds || !sessionIds.length) return [];
  try {
    const { rows } = await pool.query(
      `SELECT session_id, user_id, refresh_hash, session_expires_at
       FROM ${ClientRegistryModel.TABLE}
       WHERE session_id = ANY($1::text[])
         AND revoked_at IS NULL
         AND is_active = TRUE`,
      [sessionIds]
    );
    return rows;
  } catch (_error) {
    return [];
  }
};

module.exports = {
  create,
  findByUser,
  findByDeviceAndUser,
  toggleNotification,
  updateDevicePushToken,
  deleteTokens,
  deleteByUser,
  upsertSession,
  findActiveSession,
  revokeSession,
  revokeAllSessions,
  findDeviceIdsByUser,
  findActiveSessionsBySessionIds,
};
