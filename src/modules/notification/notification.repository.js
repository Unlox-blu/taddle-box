'use strict';

const pool = require('../../config/database');
const NotificationModel = require('./notification.model');
const NotificationConstent = require('./notification.constants')

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

const findByUser = async ({userId, limit, offset, unreadOnly = false, types = null, query = '', timeCutoff = null, sortBy = 'latest', communities = null, people = null}) => {
  try {
    const all = NotificationConstent.NOTIFICATION_TYPE_BUCKETS.all
    const like = NotificationConstent.NOTIFICATION_TYPE_BUCKETS.likes
    const comments = NotificationConstent.NOTIFICATION_TYPE_BUCKETS.comments
    const follows = NotificationConstent.NOTIFICATION_TYPE_BUCKETS.follows
    const { rows } = await pool.query(
  `
  SELECT
    ${LIST_FIELDS_QUALIFIED},

    u.name AS sender_name,
    u.username AS sender_username,
    avatar_media.cloudfront_url AS sender_avatar_url,

    COUNT(*) OVER() AS total,
    (
      SELECT json_build_object(
        'all', COUNT(*) FILTER (
          WHERE UPPER(tn.type) = ANY($12::text[])
        ),
        'likes', COUNT(*) FILTER (
          WHERE UPPER(tn.type) = ANY($13::text[])
        ),
        'comments', COUNT(*) FILTER (
          WHERE UPPER(tn.type) = ANY($14::text[])
        ),
        'follows', COUNT(*) FILTER (
          WHERE UPPER(tn.type) = ANY($15::text[])
        )
      )
      FROM ${NotificationModel.NOTIFICATION_TABLE} tn

      LEFT JOIN users tu
        ON tu.id = tn.sender_id

      LEFT JOIN communities tc
        ON tn.resource_type = 'community'
        AND tc.id = tn.resource_id

      WHERE tn.recipient_id = $1

        AND ($4 = FALSE OR tn.is_read = FALSE)
        AND (
          $10::text[] IS NULL
          OR tc.slug = ANY($10::text[])
        )
        AND (
          $11::text[] IS NULL
          OR tu.username = ANY($11::text[])
        )
        AND (
          $6 = ''
          OR tn.title ILIKE $6
          OR COALESCE(tn.message, '') ILIKE $6
          OR COALESCE(tu.name, '') ILIKE $6
          OR COALESCE(tu.username, '') ILIKE $6
        )
        AND (
          $7::timestamptz IS NULL
          OR tn.created_at >= $7
        )
    ) AS notification_counts

  FROM ${NotificationModel.NOTIFICATION_TABLE} n

  LEFT JOIN users u
    ON u.id = n.sender_id

  LEFT JOIN media avatar_media
    ON avatar_media.id = u.avatar_url

  LEFT JOIN communities c
    ON n.resource_type = 'community'
    AND c.id = n.resource_id

  WHERE n.recipient_id = $1
    AND ($4 = FALSE OR n.is_read = FALSE)
    AND (
      $10::text[] IS NULL
      OR c.slug = ANY($10::text[])
    )
    AND (
      $11::text[] IS NULL
      OR u.username = ANY($11::text[])
    )
    /*
     * Selected notification type.
     * This ONLY controls the returned rows and total.
     */
    AND (
      $5::text[] IS NULL
      OR UPPER(n.type) = ANY($5::text[])
    )
    /*
     * Server-side search.
     */
    AND (
      $6 = ''
      OR n.title ILIKE $6
      OR COALESCE(n.message, '') ILIKE $6
      OR COALESCE(u.name, '') ILIKE $6
      OR COALESCE(u.username, '') ILIKE $6
    )
    /*
     * Time-window filter.
     */
    AND (
      $7::timestamptz IS NULL
      OR n.created_at >= $7
    )
  ORDER BY
    /*
     * TOP
     */
    CASE
      WHEN $8 = 'top' THEN
        CASE
          WHEN n.meta ? 'actorCount'
            THEN (n.meta->>'actorCount')::int
          ELSE 1
        END
    END DESC,
    /*
     * HOT
     */
    CASE
      WHEN $8 = 'hot' THEN
        CASE
          WHEN n.meta ? 'actorCount'
            THEN (n.meta->>'actorCount')::int
          ELSE 1
        END
        /
        POWER(
          EXTRACT(
            EPOCH FROM (NOW() - n.created_at)
          ) / 3600 + 2,
          1.5
        )
    END DESC,
    /*
     * RELEVANCE
     */
    CASE
      WHEN $8 = 'relevance'
       AND $6 != ''
      THEN
        (
          CASE
            WHEN LOWER(COALESCE(n.title, '')) = LOWER($9)
            THEN 10000
            ELSE 0
          END
          +
          CASE
            WHEN LOWER(COALESCE(n.title, ''))
                 LIKE LOWER($9) || '%'
            THEN 7000
            ELSE 0
          END
          +
          CASE
            WHEN COALESCE(n.title, '') ILIKE $6
            THEN 5000
            ELSE 0
          END
          +
          CASE
            WHEN LOWER(COALESCE(n.message, '')) = LOWER($9)
            THEN 8000
            ELSE 0
          END
          +
          CASE
            WHEN COALESCE(n.message, '') ILIKE $6
            THEN 4000
            ELSE 0
          END
          +
          CASE
            WHEN LOWER(COALESCE(u.name, '')) = LOWER($9)
            THEN 6000
            ELSE 0
          END
          +
          CASE
            WHEN COALESCE(u.name, '') ILIKE $6
            THEN 3000
            ELSE 0
          END
          +
          CASE
            WHEN LOWER(COALESCE(u.username, '')) = LOWER($9)
            THEN 6000
            ELSE 0
          END
          +
          CASE
            WHEN COALESCE(u.username, '') ILIKE $6
            THEN 3000
            ELSE 0
          END
          +
          GREATEST(
            100
            -
            EXTRACT(
              EPOCH FROM (NOW() - n.created_at)
            ) / 86400,
            0
          )
        )
    END DESC,
    /*
     * LATEST
     */
    n.created_at DESC

  LIMIT $2
  OFFSET $3
  `,
  [
    userId,                         
    limit,                          
    offset,                         
    unreadOnly,                     
    types,                          
    query ? `%${query}%` : '',      
    timeCutoff,                     
    sortBy,                        
    query,                         
    communities,                    
    people,
    all,
    like,
    comments,
    follows                         
  ]
);

    const total = rows[0]?.total ? parseInt(rows[0]?.total, 10) : 0;
    const allTotal = rows[0]?.notification_counts.all ? parseInt(rows[0]?.notification_counts.all, 10) : 0;
    const likesTotal = rows[0]?.notification_counts.likes ? parseInt(rows[0]?.notification_counts.likes, 10) : 0;
    const commentsTotal = rows[0]?.notification_counts.comments ? parseInt(rows[0]?.notification_counts.comments, 10) : 0;
    const followsTotal = rows[0]?.notification_counts.follows ? parseInt(rows[0]?.notification_counts.follows, 10) : 0;
    const notifications = rows.map((row) => ({
      ...NotificationModel.format(row),
      senderName: row.sender_name,
      senderUsername: row.sender_username,
      senderAvatarUrl: row.sender_avatar_url,
    }));
    const filteredCount = {all: allTotal, likes: likesTotal, comments: commentsTotal, follows: followsTotal}
    return { notifications, total, filteredCount};
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
