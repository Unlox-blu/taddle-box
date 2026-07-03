'use strict';

const pool = require('../.././config/database');
const TaskModel = require('./task.model');

const create = async (userId) => {
  const { rows } = await pool.query(
    ` INSERT INTO ${TaskModel.TABLE}
    ( user_id )
    VALUES ($1)
    RETURNING ${TaskModel.LIST_FIELDS}
  `,
    [userId]
  );
  return TaskModel.format(rows[0]);
};

const findByUserId = async (userId) => {
  const { rows } = await pool.query(
    `
    SELECT ${TaskModel.LIST_FIELDS}
    FROM ${TaskModel.TABLE}
    WHERE user_id = $1
  `,
    [userId]
  );
  return TaskModel.format(rows[0]);
};

const incrementPostCount = async (userId) => {
  const { rows } = await pool.query(
    `
    UPDATE ${TaskModel.TABLE}
    SET
      post_count = post_count + 1,
      updated_at = NOW()
    WHERE user_id = $1
    RETURNING ${TaskModel.LIST_FIELDS}
  `,
    [userId]
  );
  return TaskModel.format(rows[0]);
};

const incrementShareCount = async (userId, count) => {
  const { rows } = await pool.query(
    `
    UPDATE ${TaskModel.TABLE}
    SET
      share_count = share_count + $2,
      updated_at = NOW()
    WHERE user_id = $1
    RETURNING ${TaskModel.LIST_FIELDS}
  `,
    [userId, count]
  );
  return TaskModel.format(rows[0]);
};

const updateStreak = async (userId, streak) => {
  const { rows } = await pool.query(
    `
    UPDATE ${TaskModel.TABLE}
    SET
      streak = $2,
      updated_at = NOW()
    WHERE user_id = $1
    RETURNING ${TaskModel.LIST_FIELDS}
  `,
    [userId, streak]
  );
  return TaskModel.format(rows[0]);
};

const updateProfileCompletion = async (userId, profileCompletion) => {
  const { rows } = await pool.query(
    `
    UPDATE ${TaskModel.TABLE}
    SET
      profile_completion = $2,
      updated_at = NOW()
    WHERE user_id = $1
    RETURNING ${TaskModel.LIST_FIELDS}
  `,
    [userId, profileCompletion]
  );

  return TaskModel.format(rows[0]);
};

const updateCounts = async (userId, { postCount, shareCount, streak, profileCompletion }) => {
  const { rows } = await pool.query(
    `
    UPDATE ${TaskModel.TABLE}
    SET
      post_count = COALESCE($2, post_count),
      share_count = COALESCE($3, share_count),
      streak = COALESCE($4, streak),
      profile_completion = COALESCE($5, profile_completion),
      updated_at = NOW()
    WHERE user_id = $1
    RETURNING ${TaskModel.LIST_FIELDS}
  `,
    [userId, postCount, shareCount, streak, profileCompletion]
  );

  return TaskModel.format(rows[0]);
};

module.exports = {
  create,
  findByUserId,
  incrementPostCount,
  incrementShareCount,
  updateStreak,
  updateProfileCompletion,
  updateCounts,
};
