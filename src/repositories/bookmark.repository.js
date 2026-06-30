'use strict';

const pool = require('../config/database');
const BookmarkModel = require('../models/bookmark.model');

const create = async (userId, postId) => {
    try {
        await pool.query(
            `INSERT INTO ${BookmarkModel.TABLE}
            (user_id, post_id)
            VALUES($1, $2)
            `,
            [userId, postId]
        )
    } catch (error) {
        throw error
    }
}

const findByUserIdAndPostId = async (userId, postId) => {
    try {
        const {rows} = await pool.query(
            `SELECT 1 FROM ${BookmarkModel.TABLE}
            WHERE user_id = $1 AND post_id = $2
            `,
            [userId, postId]
        )
        return rows.length > 0
    } catch (error) {
        throw error
    }
}

const hardDelete = async (userId, postId) => {
  try {
    await pool.query(
      `DELETE FROM ${BookmarkModel.TABLE}
      WHERE user_id = $1 AND post_id = $2
      `,
      [userId, postId]
    )
  } catch (error) {
    throw error
  }
}

const findByUserId = async ({userId, limit, offset}) => {
  try {
    const { rows } = await pool.query(
        `SELECT ${BookmarkModel.LIST_FIELDS},
                p.*,
                COUNT(*) OVER() AS total,
                COALESCE(
                  (SELECT json_agg(
                      json_build_object(
                          'id', m.id,
                          'media_type', m.media_type,
                          'cloudfront_url', m.cloudfront_url,
                          'processing_status', m.processing_status
                      ) ORDER BY m.created_at ASC
                    )
                  FROM media m
                  WHERE m.post_id = p.id AND m.deleted_at IS NULL
                  ), '[]'::json
                ) AS media,
                (SELECT json_build_object(
                    'id', u.id,
                    'name', u.name,
                    'username', u.username,
                    'avatar_url', ua.cloudfront_url
                )
                FROM users u
                LEFT JOIN media AS ua ON u.avatar_url = ua.id
                WHERE u.id = p.author_id
                ) AS author

        FROM ${BookmarkModel.TABLE} b 
        JOIN posts p ON p.id = b.post_id
        LEFT JOIN communities AS c ON p.community_id = c.id
        LEFT JOIN media AS ca ON c.avatar_url = ca.id
        WHERE b.user_id = $1 
          AND p.deleted_at IS NULL 
          AND p.status = 'published'
        ORDER BY b.created_at DESC
        LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );


    const total = rows[0]?.total || 0;
    return { bookmark: rows, total: parseInt(total, 10) };
  } catch (error) {
    throw error;
  }
};


module.exports = {
    create,
    findByUserIdAndPostId,
    hardDelete,
    findByUserId
}