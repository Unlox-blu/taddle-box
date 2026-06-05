'use strict';

const pool = require('../config/database');
const NotificationModel = require('../models/notification.model');

const create = async (data) => {
  try {
    const { rows } = await pool.query(
      `INSERT INTO ${NotificationModel.TABLE}
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
    return rows[0];
  } catch (error) {
    throw error;
  }
};

const findByUser = async (userId, limit, offset, unreadOnly = false) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${NotificationModel.LIST_FIELDS}, COUNT(*) OVER() AS total
     FROM ${NotificationModel.TABLE}
     WHERE recipient_id = $1 AND ($4 = FALSE OR is_read = FALSE)
     ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [userId, limit, offset, unreadOnly]
    );
    const total = rows[0]?.total || 0;
    return { rows, total: parseInt(total, 10) };
  } catch (error) {
    throw error;
  }
};

const markOneRead = async (notificationId, userId) => {
  try {
    await pool.query(
      `UPDATE ${NotificationModel.TABLE} SET is_read = TRUE, read_at = NOW()
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
      `UPDATE ${NotificationModel.TABLE} SET is_read = TRUE, read_at = NOW()
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
      `SELECT COUNT(*) AS count FROM ${NotificationModel.TABLE} WHERE recipient_id = $1 AND is_read = FALSE`,
      [userId]
    );
    return parseInt(rows[0]?.count || 0, 10);
  } catch (error) {
    throw error;
  }
};

module.exports = { create, findByUser, markOneRead, markAllRead, getUnreadCount };
