'use strict';

const { createError } = require('../utils/error.util');
const { getBucketFiles, deleteFile } = require('../integrations/storage/storage.service');

const ALLOWED_FOLDERS = ['avatars', 'banners', 'posts', 'communities', 'events'];
const MAX_IMAGE_BYTES = parseInt(process.env.MAX_FILE_SIZE_MB || '10') * 1024 * 1024;
const MAX_VIDEO_BYTES = parseInt(process.env.MAX_VIDEO_SIZE_MB || '500') * 1024 * 1024;

class MediaService {
  constructor({ mediaRepository, storageIntegration, videoIntegration }) {
    this.mediaRepo = mediaRepository;
    this.storageSvc = storageIntegration;
    this.videoSvc = videoIntegration;
  }

  
  async getImageSignedUrl({userId, body, files }) {
    try {
      const { folder } = body
      const {size: fileSize, mimetype,} = files.media
      if (!ALLOWED_FOLDERS.includes(folder)) throw createError('Invalid upload folder', 400);
      if (fileSize > MAX_IMAGE_BYTES)
        throw createError(`File size exceeds ${process.env.MAX_FILE_SIZE_MB || 10}MB limit`, 400);
      
      const s3Key = this.storageSvc.generateS3Key(folder, userId, mimetype);
      const signedUrl = await this.storageSvc.getSignedUploadUrl(s3Key, mimetype, fileSize);

      const media = await this.mediaRepo.create({
        uploaderId: userId,
        mediaType: 'image',
        s3Key,
        mimeType: mimetype,
        sizeBytes: fileSize,
        processingStatus: 'pending',
      });

      return { mediaId: media.id, signedUrl, s3Key };
    } catch (error) {
      throw error;
    }
  }

  
  async confirmImageUpload({mediaId, s3Key}) {
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

  
  async getVideoUploadUrl({userId: uploaderId, body: data }) {
    try {
      const { fileSize, title } = data
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

  
  async getMediaStatus({mediaId}) {
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



  async getMedia({userId, limit, offset}) {
    try {
      const {rows, total} = await this.mediaRepo.findByUserId(userId, limit, offset)
    
      return {media: rows, total}
    } catch (error) {
      throw error
    }
  }

  async cancleUpload({userId, mediaId}) {
    try {
      const media = await this.mediaRepo.findById(mediaId)
      
      if(!media) throw createError("Media not found",404)

      if(media.uploader_id !== userId) throw createError("You are not authorized to delete", 403)

      await this.mediaRepo.hardDelete(mediaId)
    } catch (error) {
      throw error
    }
  }


  async gets3Uploaded() {
    try {
      return await getBucketFiles()
    } catch (error) {
      throw error
    }
  }


}

module.exports = MediaService;
