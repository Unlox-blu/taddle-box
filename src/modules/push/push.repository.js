'use strict';

const pool = require('../../config/database');
const PushModel = require('./push.model');

const create = async ({ userId, token, platform }) => {
  try {
    const { rows } = await pool.query(
      `INSERT INTO ${PushModel.TABLE} (user_id, token, platform)
       VALUES ($1,$2,$3)
       ON CONFLICT (user_id, token) DO UPDATE SET platform = EXCLUDED.platform, updated_at = NOW()
       RETURNING ${PushModel.LIST_FIELDS}`,
      [userId, token, platform]
    );
    return PushModel.format(rows[0]);
  } catch (error) {
    throw error;
  }
};

const toggleNotification = async ({ userId, token}) => {
    try {
    const {rows} = await pool.query(
      `UPDATE ${PushModel.TABLE} 
      SET notifications_enabled = !notifications_enabled
      WHERE user_id = $1 AND token = $2
      RETURNING notifications_enabled`,
      [userId, token]
    );
    return PushModel.format(rows[0])
    } catch (error) {
        throw error
    }
}

const findByUser = async (userId) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${PushModel.LIST_FIELDS} 
      FROM ${PushModel.TABLE} 
      WHERE user_id = $1 AND notifications_enabled = TRUE`,
      [userId]
    );
    return rows.map(PushModel.format);
  } catch (error) {
    throw error;
  }
};

// Removes device tokens that no longer accept pushes (e.g. DeviceNotRegistered)
// so future broadcasts don't keep wasting delivery attempts.
const deleteTokens = async (tokens) => {
  try {
    if (!tokens || !tokens.length) return;
    await pool.query(
      `DELETE FROM ${PushModel.TABLE} WHERE token = ANY($1::text[])`,
      [tokens]
    );
  } catch (error) {
    throw error;
  }
};

module.exports = { create, findByUser, toggleNotification, deleteTokens};
