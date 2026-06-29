'use strict';

const pool = require('../config/database');

const MediaModel = require('../models/media.model');

const create = async (data) => {
  try {
    const { rows } = await pool.query(
      `INSERT INTO ${MediaModel.TABLE}
       (post_id, uploader_id, media_type, s3_key, vimeo_uri, mime_type, size_bytes, processing_status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
      [
        data.postId || null,
        data.uploaderId,
        data.mediaType,
        data.s3Key || null,
        data.vimeoUri || null,
        data.mimeType,
        data.sizeBytes,
        data.processingStatus || 'pending',
      ]
    );
    return rows[0];
  } catch (error) {
    throw error;
  }
};

const findById = async (mediaId) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM ${MediaModel.TABLE} 
      WHERE id = $1 AND deleted_at IS NULL`,
      [mediaId]
    );
    return rows[0] || null;
  } catch (error) {
    throw error;
  }
};

const findByPostId = async (postId, limit, offset) => {
  try {
    const { rows } = await pool.query(
      `SELECT *, COUNT(*) OVER() AS total
      FROM ${MediaModel.TABLE} 
      WHERE post_id = $1 AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3`,
      [postId, limit, offset]
    );
    const total = rows[0]?.total || 0;
    return { rows, total: parseInt(total, 10) };
  } catch (error) {
    throw error;
  }
};

const findByUserId = async (uploaderId, limit, offset) => {
  try {
    const { rows } = await pool.query(
      `SELECT *, COUNT(*) OVER() AS total
      FROM ${MediaModel.TABLE} 
      WHERE uploader_id = $1 AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3`,
      [uploaderId, limit, offset]
    );
    const total = rows[0]?.total || 0;
    return { rows, total: parseInt(total, 10) };
  } catch (error) {
    throw error
  }
}

const updateStatus = async (mediaId, status, extraData = {}) => {
  try {
    const { rows } = await pool.query(
      `UPDATE ${MediaModel.TABLE} SET processing_status = $1, cloudfront_url = COALESCE($2, cloudfront_url), updated_at = NOW()
     WHERE id = $3 RETURNING *`,
      [status, extraData.cloudfront_url || null, mediaId]
    );
    return rows[0];
  } catch (error) {
    throw error;
  }
};

const updateVimeoData = async (mediaId, vimeoData) => {
  try {
    const { rows } = await pool.query(
      `UPDATE ${MediaModel.TABLE} SET vimeo_player_url = $1, vimeo_thumbnail_url = $2, processing_status = $3, updated_at = NOW()
     WHERE id = $4 RETURNING *`,
      [vimeoData.playerUrl, vimeoData.thumbnailUrl, vimeoData.status, mediaId]
    );
    return rows[0];
  } catch (error) {
    throw error;
  }
};

const hardDelete = async (mediaId) => {
  try {
    await pool.query(`DELETE FROM ${MediaModel.TABLE} WHERE id = $1`, [mediaId]);
  } catch (error) {
    throw error
  }
}

const softDelete = async (mediaId) => {
  try {
    await pool.query(`UPDATE ${MediaModel.TABLE} SET deleted_at = NOW() WHERE id = $1`, [mediaId]);
  } catch (error) {
    throw error;
  }
};



module.exports = { create, findById, findByPostId, findByUserId, updateStatus, 
                    updateVimeoData, hardDelete, softDelete, };
