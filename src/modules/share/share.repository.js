'use strict';

const pool = require('../../config/database');
const ShareModel = require('./share.model');

const findByFollowerIdAndFollowingId = async (followerId, followingId) => {
  try {
    const { rows } = await pool.query(
      `
            SELECT status
            FROM ${ShareModel.FOLLOWER_TABLE}
            WHERE follower_id = $1 AND following_id = $2 
            `,
      [followerId, followingId]
    );
    return rows[0] || null;
  } catch (error) {
    throw error;
  }
};

const findUser = async (userId) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${ShareModel.USER_FIELDS}, 
      avatar_media.cloudfront_url AS avatar_media_url,
      banner_media.cloudfront_url AS banner_media_url
      FROM ${ShareModel.USER_TABLE} u 
      LEFT JOIN media AS avatar_media ON avatar_media.id = avatar_url
      LEFT JOIN media AS banner_media ON banner_media.id = banner_url
      WHERE u.id = $1 AND u.deleted_at IS NULL`,
      [userId]
    );
    return rows[0] ? ShareModel.formatUser(rows[0]) : null;
  } catch (error) {
    throw error;
  }
};

const findPost = async (postId) => {
  try {
    const { rows } = await pool.query(
      `SELECT 
        ${ShareModel.POST_FIELDS},
        COALESCE(
            json_agg(
                json_build_object(
                    'id', m.id,
                    'media_type', m.media_type,
                    'cloudfront_url', m.cloudfront_url,
                    'width', m.width,
                    'height', m.height,
                    's3_key', m.s3_key,
                    'processing_status', m.processing_status
                ) ORDER BY m.created_at ASC 
            ) FILTER (WHERE m.deleted_at IS NULL AND m.processing_status = 'ready'), 
            '[]'::json
        ) AS media
        FROM ${ShareModel.POST_TABLE} p
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
    return rows[0] ? ShareModel.formatPost(rows[0]) : null;
  } catch (error) {
    throw error;
  }
};


const findEvent = async (eventId) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${ShareModel.EVENT_FIELDS} 
      FROM ${ShareModel.EVENT_TABLE} 
      WHERE id = $1 AND deleted_at IS NULL`,
      [eventId]
    );
    return rows[0] ? ShareModel.formatEvent(rows[0]) : null;
  } catch (error) {
    throw error;
  }
};

const findCommunity = async (communityId) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${ShareModel.COMMUNITY_FIELDS},
      avatar_media.cloudfront_url AS avatar_media_url,
      banner_media.cloudfront_url AS banner_media_url 
      FROM ${ShareModel.COMMUNITY_TABLE} c
      LEFT JOIN media AS avatar_media ON avatar_media.id = avatar_url
      LEFT JOIN media AS banner_media ON banner_media.id = banner_url
      WHERE c.id = $1 AND c.deleted_at IS NULL`,
      [communityId]
    );
    return rows[0] ? ShareModel.formatCommunity(rows[0]) : null;
  } catch (error) {
    throw error;
  }
};


module.exports = {
    findUser, findPost, findEvent, findCommunity, findByFollowerIdAndFollowingId
}