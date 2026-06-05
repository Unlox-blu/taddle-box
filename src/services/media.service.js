'use strict';

const { createError } = require('../utils/error.util');

const ALLOWED_FOLDERS = ['avatars', 'banners', 'posts', 'communities', 'events'];
const MAX_IMAGE_BYTES = parseInt(process.env.MAX_FILE_SIZE_MB || '10') * 1024 * 1024;
const MAX_VIDEO_BYTES = parseInt(process.env.MAX_VIDEO_SIZE_MB || '500') * 1024 * 1024;

class MediaService {
  constructor({ mediaRepository, storageIntegration, videoIntegration }) {
    this.mediaRepo = mediaRepository;
    this.storageSvc = storageIntegration;
    this.videoSvc = videoIntegration;
  }

  // Step 1 of image upload.
  // Returns an S3 pre-signed PUT URL + a pending media record.
  async getImageSignedUrl(uploaderId, { fileType, fileSize, folder }) {
    try {
      if (!ALLOWED_FOLDERS.includes(folder)) throw createError('Invalid upload folder', 400);
      if (fileSize > MAX_IMAGE_BYTES)
        throw createError(`File size exceeds ${process.env.MAX_FILE_SIZE_MB || 10}MB limit`, 400);

      const s3Key = this.storageSvc.generateS3Key(folder, uploaderId, fileType);
      const signedUrl = await this.storageSvc.getSignedUploadUrl(s3Key, fileType, fileSize);

      const media = await this.mediaRepo.create({
        uploaderId,
        mediaType: 'image',
        s3Key,
        mimeType: fileType,
        sizeBytes: fileSize,
        processingStatus: 'pending',
      });

      return { mediaId: media.id, signedUrl, s3Key };
    } catch (error) {
      throw error;
    }
  }

  // Step 2 of image upload — client confirms the S3 PUT completed.
  // Verifies via S3 HEAD, then saves the CloudFront URL.
  async confirmImageUpload(mediaId, s3Key) {
    try {
      const cloudfrontUrl = await this.storageSvc.confirmUpload(s3Key);
      const media = await this.mediaRepo.updateStatus(mediaId, 'ready', {
        cloudfront_url: cloudfrontUrl,
      });
      return { url: media.cloudfront_url };
    } catch (error) {
      throw error;
    }
  }

  // Step 1 of video upload — returns Vimeo TUS upload link.
  // Client streams video directly to Vimeo; server never handles the binary.
  async getVideoUploadUrl(uploaderId, { fileSize, title }) {
    try {
      if (fileSize > MAX_VIDEO_BYTES)
        throw createError(`Video exceeds ${process.env.MAX_VIDEO_SIZE_MB || 500}MB limit`, 400);

      const { uploadLink, vimeoUri } = await this.videoSvc.createUpload(fileSize, title);

      const media = await this.mediaRepo.create({
        uploaderId,
        mediaType: 'video',
        vimeoUri,
        mimeType: 'video/mp4',
        sizeBytes: fileSize,
        processingStatus: 'pending',
      });

      return { mediaId: media.id, uploadLink, vimeoUri };
    } catch (error) {
      throw error;
    }
  }

  // Polls current processing status of a media item
  async getMediaStatus(mediaId) {
    try {
      const media = await this.mediaRepo.findById(mediaId);
      if (!media) throw createError('Media not found', 404);
      return {
        status: media.processing_status,
        url: media.cloudfront_url || media.vimeo_player_url || null,
      };
    } catch (error) {
      throw error;
    }
  }
}

module.exports = MediaService;
