'use strict';

const pool = require('../../config/database');
const PostModel = require('./post.model');


const findById = async (postId) => {
  try {
    const { rows } = await pool.query(
      `SELECT 
        ${PostModel.LIST_FIELDS},
        COALESCE(
            json_agg(
                json_build_object(
                    'id', m.id,
                    'media_type', m.media_type,
                    'cloudfront_url', m.cloudfront_url,
                    's3_key', m.s3_key,
                    'processing_status', m.processing_status
                ) ORDER BY m.created_at ASC 
            ) FILTER (WHERE m.id IS NOT NULL AND m.deleted_at IS NULL), 
            '[]'::json
        ) AS media
        FROM posts p
        JOIN users u ON p.author_id = u.id
        LEFT JOIN media AS ua ON u.avatar_url = ua.id
        LEFT JOIN communities AS c ON p.community_id = c.id
        LEFT JOIN media AS ca ON c.avatar_url = ca.id
        LEFT JOIN media m ON p.id = m.post_id
        WHERE 
            p.id = $1
            AND p.deleted_at IS NULL
        GROUP BY p.id, u.id, ua.id, c.id, ca.id`,
      [postId]
    );
    return rows[0] || null;
  } catch (error) {
    throw error;
  }
};


const findManyByUser = async (userId, limit, offset) => {
  try {
    const { rows } = await pool.query(
      `SELECT 
        ${PostModel.LIST_FIELDS},
        COALESCE(
            json_agg(
                json_build_object(
                    'id', m.id,
                    'media_type', m.media_type,
                    'cloudfront_url', m.cloudfront_url,
                    'processing_status', m.processing_status
                ) ORDER BY m.created_at ASC
            ) FILTER (WHERE m.id IS NOT NULL AND m.deleted_at IS NULL), 
            '[]'::json
        ) AS media, COUNT(*) OVER() AS total
    FROM posts p
    JOIN users u ON p.author_id = u.id
    LEFT JOIN media AS ua ON u.avatar_url = ua.id
    LEFT JOIN communities AS c ON p.community_id = c.id
    LEFT JOIN media AS ca ON c.avatar_url = ca.id
    LEFT JOIN media m ON p.id = m.post_id
    WHERE 
      p.author_id = $1
      AND p.deleted_at IS NULL
    GROUP BY p.id, u.id, ua.id, c.id, ca.id
    ORDER BY p.created_at DESC
     LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    const total = rows[0]?.total || 0;
    return { rows, total: parseInt(total, 10) };
  } catch (error) {
    throw error;
  }
};

const findManyByCommunity = async (communityId, limit, offset) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${PostModel.LIST_FIELDS}, 
      COALESCE(
            json_agg(
                json_build_object(
                    'id', m.id,
                    'media_type', m.media_type,
                    'cloudfront_url', m.cloudfront_url,
                    'processing_status', m.processing_status
                ) ORDER BY m.created_at ASC
            ) FILTER (WHERE m.id IS NOT NULL AND m.deleted_at IS NULL), 
            '[]'::json
        ) AS media, COUNT(*) OVER() AS total
    FROM posts p
    JOIN users u ON p.author_id = u.id
    LEFT JOIN media AS ua ON u.avatar_url = ua.id
    LEFT JOIN communities AS c ON p.community_id = c.id
    LEFT JOIN media AS ca ON c.avatar_url = ca.id
    LEFT JOIN media m ON p.id = m.post_id
    WHERE 
      p.community_id = $1
      AND p.deleted_at IS NULL
    GROUP BY p.id, u.id, ua.id, c.id, ca.id
    ORDER BY p.created_at DESC
     LIMIT $2 OFFSET $3`,
      [communityId, limit, offset]
    );
    const total = rows[0]?.total || 0;
    return { rows, total: parseInt(total, 10) };
  } catch (error) {
    throw error;
  }
};

const create = async (data) => {
  try {
    const { rows } = await pool.query(
      `INSERT INTO ${PostModel.TABLE}
       (author_id, community_id, title, content, media, post_type, tags, category, visibility, status, poll_data, link_data, published_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7::text[], $8::text[], $9, $10::varchar, $11, $12, CASE WHEN $10::varchar = 'published' THEN NOW() ELSE NULL END)
     RETURNING *`,
      [
        data.authorId,
        data.communityId || null,
        data.title || null,
        data.content || null,
        data.media ? JSON.stringify(data.media) : '[]',
        data.postType || 'text',
        data.tags || [],
        data.category || [],
        data.visibility || 'public',
        data.status || 'published',
        data.pollData ? JSON.stringify(data.pollData) : null,
        data.linkData ? JSON.stringify(data.linkData) : null,
      ]
    );
    return rows[0];
  } catch (error) {
    throw error;
  }
};

const update = async (postId, fields) => {
  try {
    const allowed = [
      'title',
      'content',
      'tags',
      'category',
      'visibility',
      'status',
      'poll_data',
      'link_data',
    ];
    const updates = [];
    const values = [];
    Object.entries(fields).forEach(([k, v]) => {
      const col = k.replace(/([A-Z])/g, '_$1').toLowerCase();
      if (allowed.includes(col)) {
        if(Array.isArray(v) && v.length === 0) return
        values.push(v);
        updates.push(`${col} = $${values.length}`);
      }
    });
    if (!updates.length) return findById(postId);
    values.push(postId);
    const { rows } = await pool.query(
      `UPDATE ${PostModel.TABLE} SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`,
      values
    );
    return rows[0];
  } catch (error) {
    throw error;
  }
};

const softDelete = async (postId) => {
  try {
    pool.query(`UPDATE ${PostModel.TABLE} SET deleted_at = NOW() WHERE id = $1`, [postId]);
  } catch (error) {
    throw error;
  }
};

const hardDelete = async (postId) => {
  try {
    pool.query(`DELETE FROM ${PostModel.TABLE} WHERE id = $1`, [postId]);
  } catch (error) {
    throw error;
  }
};

const addLike = async (postId, userId) => {
  try {
    pool.query(
      `INSERT INTO ${PostModel.LIKES_TABLE} (post_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [postId, userId]
    );
  } catch (error) {
    throw error;
  }
};

const removeLike = async (postId, userId) => {
  try {
    pool.query(`DELETE FROM ${PostModel.LIKES_TABLE} WHERE post_id = $1 AND user_id = $2`, [
      postId,
      userId,
    ]);
  } catch (error) {
    throw error;
  }
};

const isLikedByUser = async (postId, userId) => {
  try {
    const { rows } = await pool.query(
      `SELECT 1 FROM ${PostModel.LIKES_TABLE} WHERE post_id = $1 AND user_id = $2`,
      [postId, userId]
    );
    return rows.length > 0;
  } catch (error) {
    throw error;
  }
};

const incrementLikeCount = async (id) => {
  try {
    pool.query(`UPDATE ${PostModel.TABLE} SET likes_count    = likes_count    + 1 WHERE id = $1`, [
      id,
    ]);
  } catch (error) {
    throw error;
  }
};

const decrementLikeCount = async (id) => {
  try {
    pool.query(
      `UPDATE ${PostModel.TABLE} SET likes_count    = GREATEST(0, likes_count    - 1) WHERE id = $1`,
      [id]
    );
  } catch (error) {
    throw error;
  }
};

const incrementCommentCount = async (id) => {
  try {
    pool.query(`UPDATE ${PostModel.TABLE} SET comments_count = comments_count + 1 WHERE id = $1`, [
      id,
    ]);
  } catch (error) {
    throw error;
  }
};

const decrementCommentCount = async (id) => {
  try {
    pool.query(
      `UPDATE ${PostModel.TABLE} SET comments_count = GREATEST(0, comments_count - 1) WHERE id = $1`,
      [id]
    );
  } catch (error) {
    throw error;
  }
};

const incrementShareCount = async (id) => {
  try {
    pool.query(`UPDATE ${PostModel.TABLE} SET shares_count   = shares_count   + 1 WHERE id = $1`, [
      id,
    ]);
  } catch (error) {
    throw error;
  }
};

const incrementViewCount = async (id) => {
  try {
    pool.query(`UPDATE ${PostModel.TABLE} SET views_count    = views_count    + 1 WHERE id = $1`, [
      id,
    ]);
  } catch (error) {
    throw error;
  }
};

const search = async (query, limit, offset) => {
  try {
    const q = query || '';
    const { rows } = await pool.query(
      `SELECT ${PostModel.LIST_FIELDS}, COUNT(*) OVER() AS total
     FROM ${PostModel.TABLE} p
     JOIN users u ON u.id = p.author_id
     WHERE p.deleted_at IS NULL AND p.status = 'published' AND p.visibility = 'public'
       AND ($1 = '' OR p.title ILIKE $1 OR p.content ILIKE $1)
     ORDER BY p.created_at DESC
     LIMIT $2 OFFSET $3`,
      [`%${q}%`, limit, offset]
    );
    const total = rows[0]?.total || 0;
    return { rows, total: parseInt(total, 10) };
  } catch (error) {
    throw error;
  }
};

module.exports = {
  findById,
  findManyByUser,
  findManyByCommunity,
  create,
  update,
  softDelete,
  hardDelete,
  addLike,
  removeLike,
  isLikedByUser,
  incrementLikeCount,
  decrementLikeCount,
  incrementCommentCount,
  decrementCommentCount,
  incrementShareCount,
  incrementViewCount,
  search,
};
