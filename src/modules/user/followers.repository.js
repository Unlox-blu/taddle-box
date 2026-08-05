'use strict';

const pool = require('../../config/database');
const FollowersModel = require('./followers.model');

const UserModel = require('./user.model');

const findByFollowingId = async (userId, limit, offset) => {
  try {
    const { rows } = await pool.query(
      `
        SELECT ${UserModel.PUBLIC_FIELDS}, 
               avatar_media.cloudfront_url AS avatar_media_url,
               banner_media.cloudfront_url AS banner_media_url,
               COUNT(*) OVER() AS total 
        FROM ${FollowersModel.TABLE} f
        JOIN ${UserModel.TABLE} u ON u.id = f.follower_id
        LEFT JOIN media AS avatar_media ON avatar_media.id = u.avatar_url
        LEFT JOIN media AS banner_media ON banner_media.id = u.banner_url
        WHERE f.following_id = $1 AND f.status = 'active'
        ORDER BY f.created_at DESC
        LIMIT $2 OFFSET $3
        `,
      [userId, limit, offset]
    );
    const total = rows[0]?.total || 0;
    const followers = rows.length > 0 ? rows.map(UserModel.format) : [];

    return { followers, total };
  } catch (error) {
    throw error;
  }
};

const findByFollowerId = async (userId, limit, offset) => {
  try {
    const { rows } = await pool.query(
      `
        SELECT ${UserModel.PUBLIC_FIELDS}, 
               avatar_media.cloudfront_url AS avatar_media_url,
               banner_media.cloudfront_url AS banner_media_url,
               COUNT(*) OVER() AS total 
        FROM ${FollowersModel.TABLE} f
        JOIN ${UserModel.TABLE} u ON u.id = f.following_id
        LEFT JOIN media AS avatar_media ON avatar_media.id = u.avatar_url
        LEFT JOIN media AS banner_media ON banner_media.id = u.banner_url
        WHERE f.follower_id = $1 AND f.status = 'active' 
        ORDER BY f.created_at DESC
        LIMIT $2 OFFSET $3
        `,
      [userId, limit, offset]
    );
    const total = rows[0]?.total || 0;
    const followings = rows.length > 0 ? rows.map(UserModel.format) : [];

    return { followings, total };
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
    return rows[0] ? FollowersModel.format(rows[0]) : null;
  } catch (error) {
    throw error;
  }
};

const createFolow = async (followerId, followingId) => {
  try {
    await pool.query(
      `
        INSERT INTO ${FollowersModel.TABLE} 
        (follower_id, following_id)
        VALUES ($1, $2)
        `,
      [followerId, followingId]
    );
  } catch (error) {
    throw error;
  }
};

const createPendingFolow = async (followerId, followingId) => {
  try {
    await pool.query(
      `
        INSERT INTO ${FollowersModel.TABLE} 
        (follower_id, following_id, status)
        VALUES ($1, $2, $3)
        `,
      [followerId, followingId, 'pending']
    );
  } catch (error) {
    throw error;
  }
};

const findPendingByFollowingId = async (followingId, limit, offset) => {
  try {
    const { rows } = await pool.query(
      `
        SELECT ${UserModel.PUBLIC_FIELDS}, 
               avatar_media.cloudfront_url AS avatar_media_url,
               banner_media.cloudfront_url AS banner_media_url,
               COUNT(*) OVER() AS total 
        FROM ${FollowersModel.TABLE} f
        JOIN ${UserModel.TABLE} u ON u.id = f.follower_id
        LEFT JOIN media AS avatar_media ON avatar_media.id = u.avatar_url
        LEFT JOIN media AS banner_media ON banner_media.id = u.banner_url
        WHERE f.following_id = $1 AND f.status = 'pending'
        ORDER BY f.created_at DESC
        LIMIT $2 OFFSET $3
        `,
      [followingId, limit, offset]
    );
    const total = rows[0]?.total || 0;
    const requests = rows.length > 0 ? rows.map(UserModel.format) : [];

    return { requests, total };
  } catch (error) {
    throw error;
  }
};

const countPendingByFollowingId = async (followingId) => {
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS count FROM ${FollowersModel.TABLE} WHERE following_id = $1 AND status = 'pending'`,
      [followingId]
    );
    return rows[0]?.count || 0;
  } catch (error) {
    throw error;
  }
};

const approvefollower = async (followerId, followingId) => {
  try {
    await pool.query(
      `
        UPDATE ${FollowersModel.TABLE} 
        SET status = $1
        WHERE follower_id = $2 AND following_id = $3
        `,
      ['active', followerId, followingId]
    );
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

/**
 * Accept every pending follow request for a user in one shot (used by the
 * "Accept all" button and the automatic accept when an account switches from
 * private → public). Returns the follower ids that were accepted so the caller
 * can bump their following counters and send notifications.
 */
const approveAllPendingByFollowingId = async (followingId) => {
  try {
    const { rows } = await pool.query(
      `
        UPDATE ${FollowersModel.TABLE}
        SET status = 'active'
        WHERE following_id = $1 AND status = 'pending'
        RETURNING follower_id
        `,
      [followingId]
    );
    return rows.map(r => r.follower_id);
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
  approveAllPendingByFollowingId,
  findPendingByFollowingId,
  countPendingByFollowingId,
  hardDelete,
};
