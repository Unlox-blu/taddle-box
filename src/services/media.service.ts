import { apiClient } from './apiClient';
import * as FileSystem from 'expo-file-system/legacy';
import { error as logError } from '../utils/logger';

export interface MediaUploadResponse {
  mediaId: string;
  uploadLink?: string;
  signedUrl?: string;
  s3Key?: string;
  vimeoUri?: string;
}

export const mediaService = {
  /**
   * Request an S3 signed URL for images/audio
   */
  getSignedUrl: async (folder: 'avatars' | 'banners' | 'posts' | 'communities' | 'events', fileSize: number, mimetype: string, width?: number, height?: number): Promise<{ data: MediaUploadResponse }> => {
    const response = await apiClient.post('/media/signed-url', {
      folder,
      fileSize,
      mimetype,
      width,
      height,
    });
    return response.data;
  },

  /**
   * Confirm that an image/audio has been uploaded to S3
   */
  confirmUpload: async (mediaId: string, s3Key: string): Promise<any> => {
    const response = await apiClient.post('/media/confirm', {
      mediaId,
      s3Key,
    });
    return response.data;
  },

  /**
   * Delete a media row + its S3 object — used to clean up orphaned uploads
   * when a create flow (community/post/profile) fails after uploading.
   */
  cancleUpload: async (mediaId: string): Promise<any> => {
    const response = await apiClient.delete(`/media/${mediaId}/cancle-upload`);
    return response.data;
  },

  /**
   * Request an upload URL for videos (via Vimeo)
   */
  getVideoUploadUrl: async (fileSize: number, title: string, width?: number, height?: number): Promise<{ data: MediaUploadResponse }> => {
    const response = await apiClient.post('/media/video/upload-url', {
      fileSize,
      title,
      width,
      height,
    });
    return response.data;
  },

  /**
   * Perform the actual file upload to S3 or Vimeo (direct HTTP PUT)
   */
  uploadFileDirect: async (uploadUrl: string, fileUri: string, mimeType: string): Promise<void> => {
    try {
      const result = await FileSystem.uploadAsync(uploadUrl, fileUri, {
        httpMethod: 'PUT',
        headers: {
          'Content-Type': mimeType,
        },
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      });
      
      if (result.status < 200 || result.status >= 300) {
        throw new Error(`Upload failed with status ${result.status}`);
      }
    } catch (err) {
      logError('Error in uploadFileDirect:', err);
      throw err;
    }
  }
};
