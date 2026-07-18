'use strict';

const pool = require('../../config/database');
const NotificationModel = require('./notification.model');

const create = async (data) => {
  try {
    const { rows } = await pool.query(
      `INSERT INTO ${NotificationModel.NOTIFICATION_TABLE}
       (recipient_id, sender_id, type, title, message, resource_type, resource_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING ${NotificationModel.LIST_FIELDS}`,
      [
        data.recipientId,
        data.senderId || null,
        data.type,
        data.title,
        data.message || null,
        data.resourceType || null,
        data.resourceId || null,
      ]
    );
    return NotificationModel.format(rows[0]);
  } catch (error) {
    throw error;
  }
};

const findByUser = async (userId, limit, offset, unreadOnly = false) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${NotificationModel.LIST_FIELDS}, COUNT(*) OVER() AS total
      FROM ${NotificationModel.NOTIFICATION_TABLE}
      WHERE recipient_id = $1 AND ($4 = FALSE OR is_read = FALSE)
      ORDER BY created_at DESC 
      LIMIT $2 OFFSET $3`,
      [userId, limit, offset, unreadOnly]
    );
    const total = rows[0]?.total || 0;
    const notifications = rows.map(NotificationModel.format)
    return { notifications, total: parseInt(total, 10) };
  } catch (error) {
    throw error;
  }
};

const markOneRead = async (notificationId, userId) => {
  try {
    await pool.query(
      `UPDATE ${NotificationModel.NOTIFICATION_TABLE} 
       SET is_read = TRUE, read_at = NOW()
       WHERE id = $1 AND recipient_id = $2`,
      [notificationId, userId]
    );
  } catch (error) {
    throw error;
  }
};

const markAllRead = async (userId) => {
  try {
    await pool.query(
      `UPDATE ${NotificationModel.NOTIFICATION_TABLE} 
       SET is_read = TRUE, read_at = NOW()
       WHERE recipient_id = $1 AND is_read = FALSE`,
      [userId]
    );
  } catch (error) {
    throw error;
  }
};

const getUnreadCount = async (userId) => {
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*) AS count 
      FROM ${NotificationModel.NOTIFICATION_TABLE} 
      WHERE recipient_id = $1 AND is_read = FALSE`,
      [userId]
    );
    return parseInt(rows[0]?.count || 0, 10);
  } catch (error) {
    throw error;
  }
};

const createDefaultPreferences = async (userId) => {
  const { rows } = await pool.query(
    `INSERT INTO ${NotificationModel.PREFERENCE_TABLE} (user_id)
     VALUES ($1)
     ON CONFLICT (user_id) DO NOTHING
     RETURNING *`,
    [userId]
  );
  return rows[0] || null;
};

const findPreferenceByUserId = async (userId) => {
  const { rows } = await pool.query(
    `SELECT * FROM ${NotificationModel.PREFERENCE_TABLE} WHERE user_id = $1`,
    [userId]
  );
  return rows[0] || null;
};

const upsertPreferences = async (userId, updates) => {
  const fields = [];
  const values = [userId];
  let idx = 2;

  Object.entries(updates).forEach(([key, value]) => {
    fields.push(`${key} = $${idx}`);
    values.push(value);
    idx += 1;
  });

  const query = `
    INSERT INTO ${NotificationModel.PREFERENCE_TABLE} (user_id, ${Object.keys(updates).join(', ')})
    VALUES ($1, ${Object.keys(updates).map((_, i) => `$${i + 2}`).join(', ')})
    ON CONFLICT (user_id) DO UPDATE SET ${fields.join(', ')}, updated_at = NOW()
    RETURNING *
  `;

  const { rows } = await pool.query(query, values);
  return rows[0];
};


module.exports = { create, findByUser, markOneRead, markAllRead, getUnreadCount, createDefaultPreferences, findPreferenceByUserId, upsertPreferences };
