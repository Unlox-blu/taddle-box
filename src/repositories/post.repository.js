'use strict';

const pool = require('../config/database');
const PostModel = require('../models/post.model');

const findById = async (postId) => {
  const { rows } = await pool.query(
    `SELECT ${PostModel.DETAIL_FIELDS}
     FROM ${PostModel.TABLE} p
     JOIN users u ON u.id = p.author_id
     LEFT JOIN communities c ON c.id = p.community_id
     WHERE p.id = $1 AND p.deleted_at IS NULL`,
    [postId]
  );
  return rows[0] || null;
};

const findManyByUser = async (userId, limit, offset) => {
  const { rows } = await pool.query(
    `SELECT ${PostModel.LIST_FIELDS}, c.privacy AS community_privacy, COUNT(*) OVER() AS total
     FROM ${PostModel.TABLE} p
     JOIN users u ON u.id = p.author_id
     JOIN communities c ON c.id = p.community_id
     WHERE p.author_id = $1 AND p.deleted_at IS NULL AND p.status = 'published'
     ORDER BY p.created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );
  const total = rows[0]?.total || 0;
  return { rows, total: parseInt(total, 10) };
};

const findManyByCommunity = async (communityId, limit, offset) => {
  const { rows } = await pool.query(
    `SELECT ${PostModel.LIST_FIELDS}, COUNT(*) OVER() AS total
     FROM ${PostModel.TABLE} p
     JOIN users u ON u.id = p.author_id
     WHERE p.community_id = $1 AND p.deleted_at IS NULL AND p.status = 'published'
     ORDER BY p.created_at DESC
     LIMIT $2 OFFSET $3`,
    [communityId, limit, offset]
  );
  const total = rows[0]?.total || 0;
  return { rows, total: parseInt(total, 10) };
};

const create = async (data) => {
  // console.log(data)
  const { rows } = await pool.query(
    `INSERT INTO ${PostModel.TABLE}
       (author_id, community_id, title, content, media, post_type, tags, category, visibility, status, poll_data, link_data, published_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7::text[], $8::text[], $9, $10::varchar, $11, $12, CASE WHEN $10::varchar = 'published' THEN NOW() ELSE NULL END)
     RETURNING *`,
    [data.authorId, data.communityId || null, data.title || null, data.content || null,
    data.media ? JSON.stringify(data.media) : null, data.postType || 'text', data.tags || [], data.category || [],
    data.visibility || 'public', data.status || 'published',
    data.pollData ? JSON.stringify(data.pollData) : null,
    data.linkData ? JSON.stringify(data.linkData) : null]
  );
  return rows[0];
};

const update = async (postId, fields) => {
  const allowed = ['title', 'content', 'tags', 'category', 'visibility', 'status', 'poll_data', 'link_data'];
  const updates = [];
  const values = [];
  Object.entries(fields).forEach(([k, v]) => {
    const col = k.replace(/([A-Z])/g, '_$1').toLowerCase();
    if (allowed.includes(col)) { 
      values.push(v); updates.push(`${col} = $${values.length}`); 
    }
  });
  if (!updates.length) return findById(postId);
  values.push(postId);
  const { rows } = await pool.query(
    `UPDATE ${PostModel.TABLE} SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`,
    values
  );
  return rows[0];
};

const softDelete = async (postId) => pool.query(`UPDATE ${PostModel.TABLE} SET deleted_at = NOW() WHERE id = $1`, [postId]);

const hardDelete = async (postId) => pool.query(`DELETE FROM ${PostModel.TABLE} WHERE id = $1`, [postId]);

const addLike = async (postId, userId) => pool.query(`INSERT INTO ${PostModel.LIKES_TABLE} (post_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [postId, userId]);

const removeLike = async (postId, userId) => pool.query(`DELETE FROM ${PostModel.LIKES_TABLE} WHERE post_id = $1 AND user_id = $2`, [postId, userId]);

const isLikedByUser = async (postId, userId) => {
  const { rows } = await pool.query(`SELECT 1 FROM ${PostModel.LIKES_TABLE} WHERE post_id = $1 AND user_id = $2`, [postId, userId]);
  return rows.length > 0;
};

const incrementLikeCount = async (id) => pool.query(`UPDATE ${PostModel.TABLE} SET likes_count    = likes_count    + 1 WHERE id = $1`, [id]);

const decrementLikeCount = async (id) => pool.query(`UPDATE ${PostModel.TABLE} SET likes_count    = GREATEST(0, likes_count    - 1) WHERE id = $1`, [id]);

const incrementCommentCount = async (id) => pool.query(`UPDATE ${PostModel.TABLE} SET comments_count = comments_count + 1 WHERE id = $1`, [id]);

const decrementCommentCount = async (id) => pool.query(`UPDATE ${PostModel.TABLE} SET comments_count = GREATEST(0, comments_count - 1) WHERE id = $1`, [id]);

const incrementShareCount = async (id) => pool.query(`UPDATE ${PostModel.TABLE} SET shares_count   = shares_count   + 1 WHERE id = $1`, [id]);

const incrementViewCount = async (id) => pool.query(`UPDATE ${PostModel.TABLE} SET views_count    = views_count    + 1 WHERE id = $1`, [id]);

const search = async (filters, limit, offset) => {
  const q = filters.q || '';
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
};

module.exports = {
  findById, findManyByUser, findManyByCommunity, create, update,
  softDelete, hardDelete, addLike, removeLike, isLikedByUser,
  incrementLikeCount, decrementLikeCount, incrementCommentCount,
  decrementCommentCount, incrementShareCount, incrementViewCount, search,
};
