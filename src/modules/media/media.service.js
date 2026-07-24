'use strict';

const { createError } = require('../../utils/error.util');

const ALLOWED_FOLDERS = ['avatars', 'banners', 'posts', 'communities', 'events'];
const MAX_IMAGE_BYTES = parseInt(process.env.MAX_FILE_SIZE_MB || '10') * 1024 * 1024;
const MAX_VIDEO_BYTES = parseInt(process.env.MAX_VIDEO_SIZE_MB || '500') * 1024 * 1024;

class MediaService {
  constructor({ mediaRepository, storageIntegration, videoIntegration }) {
    this.mediaRepo = mediaRepository;
    this.storageSvc = storageIntegration;
    this.videoSvc = videoIntegration;
  }

  
  async getImageSignedUrl({userId, mediaData }) {
    try {
      const { folder, postId, fileSize, mimetype, width, height } = mediaData

      if(postId){
        const post = await this.mediaRepo.findPostByPostId(postId)
        if(!post)
          throw createError('post not found', 404)
        
        if(post.authorId !== userId)
          throw createError('You are not authorized', 403)
      }
      
      if (!ALLOWED_FOLDERS.includes(folder)) throw createError("Upload folder is not allowed", 400);
      if (fileSize > MAX_IMAGE_BYTES)
        throw createError(`File size exceeds ${process.env.MAX_FILE_SIZE_MB || 10}MB limit`, 400);
      
      const s3Key = this.storageSvc.generateS3Key(folder, userId, mimetype);
      const signedUrl = await this.storageSvc.getSignedUploadUrl(s3Key, mimetype, fileSize);

      const typePrefix = mimetype.split('/')[0]; // 'image' or 'audio'
      const media = await this.mediaRepo.create({
        postId: postId || null,
        uploaderId: userId,
        mediaType: typePrefix === 'audio' ? 'audio' : 'image',
        mimeType: mimetype,
        sizeBytes: fileSize,
        processingStatus: 'pending',
        width,
        height,
      });

      return { mediaId: media.id, signedUrl, s3Key };
    } catch (error) {
      throw error;
    }
  }

  
  async confirmImageUpload({mediaId, s3Key}) {
    try {
      const cloudfrontUrl = await this.storageSvc.confirmUpload(s3Key);

      await this.mediaRepo.updateStatus(mediaId, 'ready', cloudfrontUrl);
      return { url: cloudfrontUrl };
    } catch (error) {
      throw error;
    }
  }

  async cancleImageUpload({userId, mediaId}) {
    try {
      const media = await this.mediaRepo.findById(mediaId)
      
      if(!media) throw createError("Media not found",404)

      if(media.uploaderId !== userId) throw createError("You are not authorized to delete", 403)

      await this.storageSvc.deleteFile(media.s3Key)
      await this.mediaRepo.hardDelete(mediaId)
    } catch (error) {
      throw error
    }
  }
  
  async clearS3Storage ({userId, mediaId}) {
    try {
      const media = await this.mediaRepo.findById(mediaId)

      if(media.uploaderId !== userId)
        throw createError('You are not authorized', 403)

      const s3Key = media.s3Key

      if(!s3Key)
        throw createError('s3Key is not found', 404)

      await this.storageSvc.deleteFile(s3Key)

      await this.mediaRepo.hardDelete(mediaId)

    } catch (error) {
      throw error
    }
  }


  async getVideoUploadUrl({userId: uploaderId, body: data }) {
    try {
      const { fileSize, title, postId, width, height } = data;
      const videoSize = parseInt(fileSize, 10);
      
      if (videoSize > MAX_VIDEO_BYTES)
        throw createError(`Video exceeds ${process.env.MAX_VIDEO_SIZE_MB || 500}MB limit`, 400);

      const { uploadLink, vimeoUri } = await this.videoSvc.createUpload(videoSize, title);

      const media = await this.mediaRepo.create({
        postId: postId || null,
        uploaderId,
        mediaType: 'video',
        vimeoUri,
        mimeType: 'video/mp4',
        sizeBytes: videoSize,
        processingStatus: 'pending',
        width,
        height,
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
        status: media.processingStatus,
        url: media.cloudfrontUrl || media.vimeoPlayerUrl || null,
      };
    } catch (error) {
      throw error;
    }
  }

  async getMedia({userId, limit, offset}) {
    try {
      const {media, total} = await this.mediaRepo.findByUserId(userId, limit, offset)
    
      return {media, total}
    } catch (error) {
      throw error
    }
  }



  async gets3Uploaded() {
    try {
      return await this.storageSvc.getBucketFiles()
    } catch (error) {
      throw error
    }
  }


}

module.exports = MediaService;
