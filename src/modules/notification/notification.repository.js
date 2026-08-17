'use strict';

const pool = require('../../config/database');
const NotificationModel = require('./notification.model');

const isMissingRelation = (error) => error?.code === '42P01';

const createNotification = async (data) => {
  try {
    const { rows } = await pool.query(
      `INSERT INTO ${NotificationModel.NOTIFICATION_TABLE}
       (recipient_id, sender_id, type, title, message, resource_type, resource_id, meta)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING ${NotificationModel.LIST_FIELDS}`,
      [
        data.recipientId,
        data.senderId || null,
        data.type,
        data.title,
        data.message || null,
        data.resourceType || null,
        data.resourceId || null,
        data.meta || null,
      ]
    );
    return NotificationModel.format(rows[0]);
  } catch (error) {
    if (isMissingRelation(error)) return null;
    throw error;
  }
};

// Bulk fan-out insert (e.g. "X posted" → followers): ONE multi-row INSERT
// instead of N single-row inserts. Each item: {recipientId, senderId, type,
// title, message, resourceType, resourceId}. Returns the inserted row count.
const createNotificationsBatch = async (items) => {
  if (!Array.isArray(items) || items.length === 0) return 0;
  try {
    const values = [];
    const params = [];
    items.forEach((d, i) => {
      const base = i * 7;
      params.push(
        d.recipientId,
        d.senderId || null,
        d.type,
        d.title || null,
        d.message || null,
        d.resourceType || null,
        d.resourceId || null
      );
      values.push(`($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7})`);
    });
    const { rowCount } = await pool.query(
      `INSERT INTO ${NotificationModel.NOTIFICATION_TABLE}
       (recipient_id, sender_id, type, title, message, resource_type, resource_id)
       VALUES ${values.join(', ')}`,
      params
    );
    return rowCount || 0;
  } catch (error) {
    // A single bad row (e.g. deleted sender) shouldn't drop the whole fan-out.
    if (isMissingRelation(error)) return 0;
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
  'n.resource_type', 'n.resource_id', 'n.meta', 'n.is_read', 'n.read_at', 'n.created_at',
].join(', ');

const findByUser = async (userId, limit, offset, unreadOnly = false, types = null, q = '', timeCutoff = null, sort = 'latest') => {
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
        -- $5 is a comma-separated list of stored types (e.g. COMMENT,REPLY).
        -- UPPER() comparison because the table carries BOTH uppercase types
        -- (publishNotification/normalizeType, e.g. POST_LIKE, FOLLOW) and
        -- legacy lowercase ones (notification.jobprocessor, e.g. post_liked,
        -- follow) — callers pass the uppercase spelling of each.
        AND ($5::text[] IS NULL OR UPPER(n.type) = ANY($5::text[]))
        -- Server-side search: title / message / sender name / sender username.
        AND (
            $6 = ''
            OR n.title ILIKE $6
            OR COALESCE(n.message, '') ILIKE $6
            OR COALESCE(u.name, '') ILIKE $6
            OR COALESCE(u.username, '') ILIKE $6
        )
        -- Time-window filter ($7 = cutoff timestamp; null = all time).
        AND ($7::timestamptz IS NULL OR n.created_at >= $7)
      ORDER BY
        -- Sort ($8), mirroring global search:
        --  · 'latest' (default) → newest-first (created_at DESC).
        --  · 'top' → most-engaged first: stacked notifications carry
        --    meta.actorCount (how many people interacted, Instagram-style);
        --    unstacked rows count as 1.
        --  · 'hot' → the same engagement decayed by age (Reddit-style),
        --    mirroring the post search's hot formula.
        --  · 'relevance' → query-match strength (exact title/message/sender
        --    match > prefix > fuzzy) + freshness, like the post search. No
        --    query ($6 = '') → the CASE is NULL → created_at wins.
        CASE WHEN $8 = 'top' THEN
          CASE WHEN n.meta ? 'actorCount' THEN (n.meta->>'actorCount')::int ELSE 1 END
        END DESC,
        CASE WHEN $8 = 'hot' THEN
          CASE WHEN n.meta ? 'actorCount' THEN (n.meta->>'actorCount')::int ELSE 1 END
          / POWER(EXTRACT(EPOCH FROM (NOW() - n.created_at)) / 3600 + 2, 1.5)
        END DESC,
        CASE WHEN $8 = 'relevance' AND $6 != '' THEN
          (
            CASE WHEN LOWER(COALESCE(n.title, '')) = LOWER($9) THEN 10000 ELSE 0 END
            + CASE WHEN LOWER(COALESCE(n.title, '')) LIKE LOWER($9) || '%' THEN 7000 ELSE 0 END
            + CASE WHEN COALESCE(n.title, '') ILIKE $6 THEN 5000 ELSE 0 END
            + CASE WHEN LOWER(COALESCE(n.message, '')) = LOWER($9) THEN 8000 ELSE 0 END
            + CASE WHEN COALESCE(n.message, '') ILIKE $6 THEN 4000 ELSE 0 END
            + CASE WHEN LOWER(COALESCE(u.name, '')) = LOWER($9) THEN 6000 ELSE 0 END
            + CASE WHEN COALESCE(u.name, '') ILIKE $6 THEN 3000 ELSE 0 END
            + CASE WHEN LOWER(COALESCE(u.username, '')) = LOWER($9) THEN 6000 ELSE 0 END
            + CASE WHEN COALESCE(u.username, '') ILIKE $6 THEN 3000 ELSE 0 END
            + GREATEST(100 - EXTRACT(EPOCH FROM (NOW() - n.created_at)) / 86400, 0)
          )
        END DESC,
        n.created_at DESC
      LIMIT $2 OFFSET $3`,
      [userId, limit, offset, unreadOnly, types, q ? `%${q}%` : '', timeCutoff, sort, q]
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

// Per-bucket counts for the notification pills, computed with the SAME
// q/time filters as the list so the numbers match what a bucket would show.
const countByTypes = async (userId, q = '', timeCutoff = null) => {
  try {
    const { likes, comments, follows } = require('./notification.constants').NOTIFICATION_TYPE_BUCKETS;
    const { rows } = await pool.query(
      `SELECT
          COUNT(*) FILTER (WHERE UPPER(type) = ANY($2::text[])) AS likes,
          COUNT(*) FILTER (WHERE UPPER(type) = ANY($3::text[])) AS comments,
          COUNT(*) FILTER (WHERE UPPER(type) = ANY($4::text[])) AS follows
       FROM ${NotificationModel.NOTIFICATION_TABLE} n
       LEFT JOIN users u ON u.id = n.sender_id
       WHERE n.recipient_id = $1
         AND (
             $5 = ''
             OR n.title ILIKE $5
             OR COALESCE(n.message, '') ILIKE $5
             OR COALESCE(u.name, '') ILIKE $5
             OR COALESCE(u.username, '') ILIKE $5
         )
         AND ($6::timestamptz IS NULL OR n.created_at >= $6)`,
      [userId, likes, comments, follows, q ? `%${q}%` : '', timeCutoff]
    );
    const r = rows[0] || {};
    return {
      likes: parseInt(r.likes, 10) || 0,
      comments: parseInt(r.comments, 10) || 0,
      follows: parseInt(r.follows, 10) || 0,
    };
  } catch (error) {
    if (isMissingRelation(error)) return { likes: 0, comments: 0, follows: 0 };
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


module.exports = { createNotification, createNotificationsBatch, createBatchNotification, addToBatchNotification, findByUser, markOneRead, markAllRead, countByTypes, getUnreadCount, createDefaultPreferences, findPreferenceByUserId, upsertPreferences };
