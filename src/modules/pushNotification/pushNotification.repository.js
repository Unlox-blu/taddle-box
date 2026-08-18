'use strict';

const pool = require('../../config/database');
const PushNotificationModel = require('./pushNotification.model');

// Upserts a device record.  The natural key is (user_id, device_id) — one
// token per device, regardless of provider or platform.  When a device
// re-registers (e.g. Expo → FCM migration), the upsert overwrites the old row.
const create = async ({ userId, deviceId, pushToken, pushProvider, platform }) => {
  try {
    const { rows } = await pool.query(
      `INSERT INTO ${PushNotificationModel.TABLE}
         (user_id, device_id, push_token, push_provider, platform)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, device_id) DO UPDATE SET
         push_token    = EXCLUDED.push_token,
         push_provider = EXCLUDED.push_provider,
         platform      = EXCLUDED.platform,
         is_active     = TRUE,
         updated_at    = NOW()
       RETURNING ${PushNotificationModel.LIST_FIELDS}`,
      [userId, deviceId, pushToken, pushProvider, platform]
    );
    return PushNotificationModel.format(rows[0]);
  } catch (error) {
    throw error;
  }
};

const toggleNotification = async ({ userId, deviceId }) => {
  try {
    const { rows } = await pool.query(
      `UPDATE ${PushNotificationModel.TABLE}
       SET notifications_enabled = NOT notifications_enabled
       WHERE user_id = $1 AND device_id = $2
       RETURNING notifications_enabled`,
      [userId, deviceId]
    );
    return PushNotificationModel.format(rows[0]);
  } catch (error) {
    throw error;
  }
};

const findByUser = async (userId) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${PushNotificationModel.LIST_FIELDS}
       FROM ${PushNotificationModel.TABLE}
       WHERE user_id = $1 AND notifications_enabled = TRUE AND is_active = TRUE`,
      [userId]
    );
    return rows.map(PushNotificationModel.format);
  } catch (error) {
    throw error;
  }
};

// Removes device records by push_token value (used for dead-token pruning).
const deleteTokens = async (tokens) => {
  try {
    if (!tokens || !tokens.length) return;
    await pool.query(
      `DELETE FROM ${PushNotificationModel.TABLE} WHERE push_token = ANY($1::text[])`,
      [tokens]
    );
  } catch (error) {
    // Best-effort.
  }
};

// Removes ALL device records for a user (e.g. on logout).
const deleteByUser = async (userId) => {
  try {
    await pool.query(
      `DELETE FROM ${PushNotificationModel.TABLE} WHERE user_id = $1`,
      [userId]
    );
  } catch (error) {
    // Best-effort — never break logout because of token cleanup.
  }
};

module.exports = { create, findByUser, toggleNotification, deleteTokens, deleteByUser };
