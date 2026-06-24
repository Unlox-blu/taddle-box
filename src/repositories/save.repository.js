'use strict';

const pool = require('../config/database');
const SaveModel = require('../models/save.model');

const create = async (userId, eventId) => {
    try {
        await pool.query(
            `INSERT INTO ${SaveModel.TABLE}
            (user_id, event_id)
            VALUES($1, $2)
            `,
            [userId, eventId]
        )
    } catch (error) {
        throw error
    }
}

const findByUserIdAndEventId = async (userId, eventId) => {
    try {
        const {rows} = await pool.query(
            `SELECT 1 FROM ${SaveModel.TABLE}
            WHERE user_id = $1 AND event_id = $2
            `,
            [userId, eventId]
        )
        return rows.length > 0
    } catch (error) {
        throw error
    }
}

const hardDelete = async (userId, eventId) => {
  try {
    await pool.query(
      `DELETE FROM ${SaveModel.TABLE}
      WHERE user_id = $1 AND event_id = $2
      `,
      [userId, eventId]
    )
  } catch (error) {
    throw error
  }
}

const findByUserId = async ({ userId, limit, offset }) => {
  try {
    const { rows } = await pool.query(
      `
      SELECT ${SaveModel.LIST_FIELDS}, e.*, COUNT(*) OVER() AS total
      FROM ${SaveModel.TABLE} s
      JOIN events e ON e.id = s.event_id
      WHERE s.user_id = $1
        AND e.deleted_at IS NULL
        AND e.status = 'upcoming'
      ORDER BY s.created_at DESC
      LIMIT $2 OFFSET $3
      `,
      [userId, limit, offset]
    );

    const total = rows[0]?.total || 0;

    return { saved: rows, total: Number(total) };
  } catch (error) {
    throw error;
  }
};


module.exports = {
    create,
    findByUserIdAndEventId,
    hardDelete,
    findByUserId
}