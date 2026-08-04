'use strict';

const pool = require('../../config/database');
const NotificationModel = require('./notification.model');

const isMissingRelation = (error) => error?.code === '42P01';

const createNotification = async (data) => {
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
    if (isMissingRelation(error)) return null;
    throw error;
  }
};

const createBatchNotification = async (data) => {
  try {
    const { rows } = await pool.query(
      `INSERT INTO ${NotificationModel.NOTIFICATION_BATCH_TABLE}
       (recipient_id, sender_id, type, title, resource_type, resource_id)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING ${NotificationModel.NOTIFICATION_BATCH_FIELDS}`,
      [
        data.recipientId,
        data.senderId || [],
        data.type,
        data.title,
        data.resourceType || null,
        data.resourceId || null,
      ]
    );
    return NotificationModel.format(rows[0]);
  } catch (error) {
    if (isMissingRelation(error)) return null;
    throw error;
  }
}

const addToBatchNotification = async ({recipientId, senderId, resourceId}) => {
  try {
  await pool.query(
      ` UPDATE ${NotificationModel.NOTIFICATION_BATCH_TABLE}
      SET sender_id = array_append(sender_id, $1)
      WHERE id = (
          SELECT id
          FROM ${NotificationModel.NOTIFICATION_BATCH_TABLE}
          WHERE recipient_id = $2
            AND resource_id = $3
          ORDER BY created_at DESC
          LIMIT 1
      )`,
      [senderId, recipientId, resourceId]
    );
  } catch (error) {
    if (isMissingRelation(error)) return;
    console.log(error)
    throw error
  }
}




// Qualified field list for queries that join users/media — keeps column
// references unambiguous when joined tables also expose id/type/created_at.
const LIST_FIELDS_QUALIFIED = [
  'n.id', 'n.sender_id', 'n.type', 'n.title', 'n.message',
  'n.resource_type', 'n.resource_id', 'n.is_read', 'n.read_at', 'n.created_at',
].join(', ');

const findByUser = async (userId, limit, offset, unreadOnly = false) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${LIST_FIELDS_QUALIFIED},
              u.name AS sender_name, u.username AS sender_username,
              avatar_media.cloudfront_url AS sender_avatar_url,
              COUNT(*) OVER() AS total
      FROM ${NotificationModel.NOTIFICATION_TABLE} n
      LEFT JOIN users u ON u.id = n.sender_id
      LEFT JOIN media avatar_media ON avatar_media.id = u.avatar_url
      WHERE n.recipient_id = $1 AND ($4 = FALSE OR n.is_read = FALSE)
      ORDER BY n.created_at DESC 
      LIMIT $2 OFFSET $3`,
      [userId, limit, offset, unreadOnly]
    );
    const total = rows[0]?.total || 0;
    const notifications = rows.map((row) => ({
      ...NotificationModel.format(row),
      senderName: row.sender_name,
      senderUsername: row.sender_username,
      senderAvatarUrl: row.sender_avatar_url,
    }));
    return { notifications, total: parseInt(total, 10) };
  } catch (error) {
    if (isMissingRelation(error)) return { notifications: [], total: 0 };
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
    if (isMissingRelation(error)) return;
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
    if (isMissingRelation(error)) return;
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
    if (isMissingRelation(error)) return 0;
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


module.exports = { createNotification, createBatchNotification, addToBatchNotification, findByUser, markOneRead, markAllRead, getUnreadCount, createDefaultPreferences, findPreferenceByUserId, upsertPreferences };
