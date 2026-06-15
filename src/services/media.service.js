'use strict';

const { createError } = require('../utils/error.util');
const { uploadFile, deleteFile } = require('../integrations/storage/cloudinary.service');

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


  async uploadImage(userId, folder, mediaFiles) {
    try {
      if (!mediaFiles) throw createError('No file provided', 400);

      if(!folder) throw createError('Provide the folder name', 400);

      if (!ALLOWED_FOLDERS.includes(folder)) throw createError('Invalid upload folder', 400);

      if(Array.isArray(mediaFiles) && mediaFiles.length > 1 && ['avatars', 'banners'].includes(folder))
        throw createError(`${folder} can contain only one image`, 400);

      let totalFileSize = 0
      const fileSize = []
      const bufferData = []

      if(Array.isArray(mediaFiles)){
        totalFileSize = mediaFiles.reduce((acc, file) =>{
          bufferData.push(file.data)
          fileSize.push(file.size)
          return acc += file.size
        }, 0)
      }
      else{
        bufferData.push(mediaFiles.data)
        fileSize.push(mediaFiles.size)
        totalFileSize = mediaFiles.size
      }
      
      if(totalFileSize === 0) throw createError('Invalid file', 400);

      if (totalFileSize > MAX_IMAGE_BYTES)
        throw createError(`File size exceeds ${process.env.MAX_FILE_SIZE_MB || 10}MB limit`, 400);

      const media = await Promise.all(bufferData.map(async (buffer) => {
                      const result = await uploadFile(buffer, folder, userId)
                      return result
                    }))

      const mediaData = []

      media.forEach((ele, i) => {
        const data = {
          uploaderId: userId,
          mediaType: "image",
          s3Key: ele.publicId,
          vimeoUri: ele.url,
          sizeBytes: fileSize[i]
        }
        mediaData.push(data)
      })
      
      const res = await Promise.all(mediaData.map(async (data) => {
                      const result = this.mediaRepo.create(data)
                      return result
                    }))
      
      return res
    } catch (error) {
      throw error
    }
  }

  async getMedia(userId, limit, offset) {
    try {
      const {rows, total} = await this.mediaRepo.findByUserId(userId, limit, offset)
    
      return {media: rows, total}
    } catch (error) {
      throw error
    }
  }

  async deleteMedia(userId, mediaId) {
    try {
      const media = await this.mediaRepo.findById(mediaId)
      
      if(!media) throw createError("Media not found",404)

      if(media.uploader_id !== userId) throw createError("You are not authorized to delete", 403)

      const publicId = media.s3_key
      await deleteFile(publicId)
      await this.mediaRepo.hardDelete(mediaId)
    } catch (error) {
      throw error
    }
  }


}

module.exports = MediaService;
