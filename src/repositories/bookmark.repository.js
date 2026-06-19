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
        `SELECT ${BookmarkModel.LIST_FIELDS}, p.*, COUNT(*) OVER() AS total
        FROM ${BookmarkModel.TABLE} b JOIN posts p ON p.id = b.post_id
        WHERE b.user_id = $1 AND p.deleted_at IS NULL AND p.status = 'published'
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