'use strict';

const MEDIA_TABLE = 'media';
const POST_TABLE = 'posts';


const MEDIA_FIELDS = [
  'id', 'post_id', 'uploader_id', 'media_type',
  's3_key', 'cloudfront_url', 'vimeo_uri', 'vimeo_player_url', 'vimeo_thumbnail_url',
  'mime_type', 'size_bytes', 'width', 'height',
  'duration_seconds', 'processing_status', 'deleted_at', 'created_at', 'updated_at'
].join(', ');





const format = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    postId: row.post_id,
    uploaderId: row.uploader_id,
    mediaType: row.media_type,
    s3Key: row.s3_key,
    cloudfrontUrl: row.cloudfront_url,
    vimeoUri: row.vimeo_uri,
    vimeoPlayerUrl: row.vimeo_player_url,
    vimeoThumbnailUrl: row.vimeo_thumbnail_url,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    width: row.width,
    height: row.height,
    durationSeconds: row.duration_seconds,
    processingStatus: row.processing_status,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    authorId: row.author_id,
  };
};

module.exports = {
  MEDIA_TABLE, MEDIA_FIELDS, POST_TABLE, format,
};
