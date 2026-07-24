'use strict';

const pool = require('../../config/database');
const CommentModel = require('./comment.model');

const findById = async (commentId) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${CommentModel.LIST_FIELDS}
     FROM ${CommentModel.TABLE} c 
     JOIN users u ON u.id = c.author_id
     WHERE c.id = $1 AND c.deleted_at IS NULL`,
      [commentId]
    );
    return rows[0] || null;
  } catch (error) {
    throw error;
  }
};

const findByPost = async (postId, limit, offset, parentId = null, userId = null) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${CommentModel.LIST_FIELDS}, COUNT(*) OVER() AS total,
       EXISTS(SELECT 1 FROM ${CommentModel.LIKES_TABLE} cl WHERE cl.comment_id = c.id AND cl.user_id = $5) as is_liked
     FROM ${CommentModel.TABLE} c JOIN users u ON u.id = c.author_id
     WHERE c.post_id = $1 AND c.deleted_at IS NULL
       AND ($2::uuid IS NULL AND c.parent_id IS NULL OR c.parent_id = $2::uuid)
     ORDER BY c.created_at ASC
     LIMIT $3 OFFSET $4`,
      [postId, parentId, limit, offset, userId]
    );
    const total = rows[0]?.total || 0;
    return { rows, total: parseInt(total, 10) };
  } catch (error) {
    throw error;
  }
};

const create = async ({ postId, authorId, content, parentId, depth, path }) => {
  try {
    const { rows } = await pool.query(
      `INSERT INTO ${CommentModel.TABLE} (post_id, author_id, content, parent_id, depth, path)
     VALUES ($1, $2, $3, $4, $5, $6::uuid[])
     RETURNING *`,
      [postId, authorId, content, parentId || null, depth || 0, path || []]
    );
    return rows[0];
  } catch (error) {
    throw error;
  }
};

const update = async (commentId, content) => {
  try {
    const { rows } = await pool.query(
      `UPDATE ${CommentModel.TABLE} SET content = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [content, commentId]
    );
    return rows[0];
  } catch (error) {
    throw error;
  }
};

const softDelete = async (commentId) => {
  try {
    await pool.query(
      `UPDATE ${CommentModel.TABLE} SET deleted_at = NOW(), content = '[deleted]' WHERE id = $1`,
      [commentId]
    );
  } catch (error) {
    throw error;
  }
};

const addLike = async (commentId, userId) => {
  try {
    pool.query(
      `INSERT INTO ${CommentModel.LIKES_TABLE} (comment_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [commentId, userId]
    );
  } catch (error) {
    throw error;
  }
};

const removeLike = async (commentId, userId) => {
  try {
    pool.query(`DELETE FROM ${CommentModel.LIKES_TABLE} WHERE comment_id = $1 AND user_id = $2`, [
      commentId,
      userId,
    ]);
  } catch (error) {
    throw error;
  }
};

const isLikedByUser = async (commentId, userId) => {
  try {
    const { rows } = await pool.query(
      `SELECT 1 FROM ${CommentModel.LIKES_TABLE} WHERE comment_id = $1 AND user_id = $2`,
      [commentId, userId]
    );
    return rows.length > 0;
  } catch (error) {
    throw error;
  }
};

const incrementLikeCount = async (id) => {
  try {
    pool.query(`UPDATE ${CommentModel.TABLE} SET likes_count = likes_count + 1 WHERE id = $1`, [
      id,
    ]);
  } catch (error) {
    throw error;
  }
};
const decrementLikeCount = async (id) => {
  try {
    pool.query(
      `UPDATE ${CommentModel.TABLE} SET likes_count = GREATEST(0, likes_count - 1) WHERE id = $1`,
      [id]
    );
  } catch (error) {
    throw error;
  }
};

module.exports = {
  findById,
  findByPost,
  create,
  update,
  softDelete,
  addLike,
  removeLike,
  isLikedByUser,
  incrementLikeCount,
  decrementLikeCount,
};
