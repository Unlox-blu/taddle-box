import { apiClient } from './apiClient';

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
  getSignedUrl: async (folder: 'avatars' | 'banners' | 'posts' | 'communities' | 'events', fileSize: number, mimetype: string): Promise<{ data: MediaUploadResponse }> => {
    const response = await apiClient.post('/media/signed-url', {
      folder,
      fileSize,
      mimetype,
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
   * Request an upload URL for videos (via Vimeo)
   */
  getVideoUploadUrl: async (fileSize: number, title: string): Promise<{ data: MediaUploadResponse }> => {
    const response = await apiClient.post('/media/video/upload-url', {
      fileSize,
      title,
    });
    return response.data;
  },

  /**
   * Perform the actual file upload to S3 or Vimeo (direct HTTP PUT)
   */
  uploadFileDirect: async (uploadUrl: string, fileUri: string, mimeType: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', uploadUrl);
      xhr.setRequestHeader('Content-Type', mimeType);
      
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      };
      
      xhr.onerror = () => reject(new Error('Network error during upload'));
      
      // React Native's XHR polyfill handles { uri, type, name } for files automatically
      xhr.send({ uri: fileUri, type: mimeType, name: 'upload' } as any);
    });
  }
};
