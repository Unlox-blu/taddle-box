'use strict';

const pool = require('../config/database');
const FollowersModel = require('../models/followers.model');

const findByFollowingId = async (userId, limit, offset) => {
  try {
    const { rows } = await pool.query(
      `
        SELECT ${FollowersModel.PUBLIC_FIELDS}, COUNT(*) OVER() AS total 
        FROM ${FollowersModel.TABLE}
        WHERE following_id = $1 AND status = 'active'
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3
        `,
      [userId, limit, offset]
    );
    const total = rows[0]?.total || 0;
    const followings = rows.length > 0 ? rows : [];

    return { followings, total };
  } catch (error) {
    throw error;
  }
};

const findByFollowerId = async (userId, limit, offset) => {
  try {
    const { rows } = await pool.query(
      `
        SELECT ${FollowersModel.PUBLIC_FIELDS}, COUNT(*) OVER() AS total 
        FROM ${FollowersModel.TABLE}
        WHERE follower_id = $1 AND status = 'active' 
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3
        `,
      [userId, limit, offset]
    );
    const total = rows[0]?.total || 0;
    const followers = rows.length > 0 ? rows : [];

    return { followers, total };
  } catch (error) {
    throw error;
  }
};

const findByFollowerIdAndFollowingId = async (followerId, followingId) => {
  try {
    const { rows } = await pool.query(
      `
            SELECT ${FollowersModel.PUBLIC_FIELDS} 
            FROM ${FollowersModel.TABLE}
            WHERE follower_id = $1 AND following_id = $2 
            `,
      [followerId, followingId]
    );
    return rows[0];
  } catch (error) {
    throw error;
  }
};

const createFolow = async (followerId, followingId) => {
  try {
    const { rows } = await pool.query(
      `
        INSERT INTO ${FollowersModel.TABLE} 
        (follower_id, following_id)
        VALUES ($1, $2)
        `,
      [followerId, followingId]
    );

    return rows[0];
  } catch (error) {
    throw error;
  }
};

const createPendingFolow = async (followerId, followingId) => {
  try {
    const { rows } = await pool.query(
      `
        INSERT INTO ${FollowersModel.TABLE} 
        (follower_id, following_id, status)
        VALUES ($1, $2, $3)
        `,
      [followerId, followingId, 'pending']
    );

    return rows[0];
  } catch (error) {
    throw error;
  }
};

const approvefollower = async (followerId, followingId) => {
  try {
    const { rows } = await pool.query(
      `
        UPDATE ${FollowersModel.TABLE} 
        SET status = $1
        WHERE follower_id = $2 AND following_id = $3
        `,
      ['active', followerId, followingId]
    );

    return rows[0];
  } catch (error) {
    throw error;
  }
}

const hardDelete = async (followerId, followingId) => {
  try {
    await pool.query(
      `
        DELETE FROM ${FollowersModel.TABLE} 
        WHERE follower_id = $1 AND following_id = $2
        `,
      [followerId, followingId]
    );
  } catch (error) {
    throw error;
  }
};

module.exports = {
  findByFollowingId,
  findByFollowerId,
  findByFollowerIdAndFollowingId,
  createFolow,
  createPendingFolow,
  approvefollower,
  hardDelete,
};
