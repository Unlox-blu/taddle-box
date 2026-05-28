'use strict';

const pool = require('../config/database');

const TABLE = 'media';

const create = async (data) => {
  const { rows } = await pool.query(
    `INSERT INTO ${TABLE}
       (uploader_id, media_type, s3_key, vimeo_uri, mime_type, size_bytes, processing_status)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING *`,
    [data.uploaderId, data.mediaType, data.s3Key || null, data.vimeoUri || null,
    data.mimeType, data.sizeBytes, data.processingStatus || 'pending']
  );
  return rows[0];
};

const findById = async (mediaId) => {
  const { rows } = await pool.query(`SELECT * FROM ${TABLE} WHERE id = $1 AND deleted_at IS NULL`, [mediaId]);
  return rows[0] || null;
};

const updateStatus = async (mediaId, status, extraData = {}) => {
  const { rows } = await pool.query(
    `UPDATE ${TABLE} SET processing_status = $1, cloudfront_url = COALESCE($2, cloudfront_url), updated_at = NOW()
     WHERE id = $3 RETURNING *`,
    [status, extraData.cloudfront_url || null, mediaId]
  );
  return rows[0];
};

const updateVimeoData = async (mediaId, vimeoData) => {
  const { rows } = await pool.query(
    `UPDATE ${TABLE} SET vimeo_player_url = $1, vimeo_thumbnail_url = $2, processing_status = $3, updated_at = NOW()
     WHERE id = $4 RETURNING *`,
    [vimeoData.playerUrl, vimeoData.thumbnailUrl, vimeoData.status, mediaId]
  );
  return rows[0];
};

const softDelete = async (mediaId) => {
  await pool.query(`UPDATE ${TABLE} SET deleted_at = NOW() WHERE id = $1`, [mediaId]);
};

module.exports = { create, findById, updateStatus, updateVimeoData, softDelete };
