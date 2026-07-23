import { apiClient } from './apiClient';
import type { Post } from '../types';

export const postsService = {
  getFeed: async (page = 1, limit = 20): Promise<{ data: Post[] }> => {
    const response = await apiClient.get(`/feed?page=${page}&limit=${limit}`);
    return response.data;
  },

  createPost: async (postData: any): Promise<{ data: Post }> => {
    const response = await apiClient.post('/posts/create-post', postData);
    return response.data;
  },

  toggleLike: async (postId: string, isCurrentlyLiked: boolean) => {
    if (isCurrentlyLiked) {
      const response = await apiClient.delete(`/posts/${postId}/like`);
      return response.data;
    } else {
      const response = await apiClient.post(`/posts/${postId}/like`);
      return response.data;
    }
  },

  toggleSave: async (postId: string, isCurrentlySaved: boolean) => {
    if (isCurrentlySaved) {
      const response = await apiClient.delete(`/posts/${postId}/bookmark`);
      return response.data;
    } else {
      const response = await apiClient.post(`/posts/${postId}/bookmark`);
      return response.data;
    }
  },

  deletePost: async (postId: string) => {
    const response = await apiClient.delete(`/posts/${postId}`);
    return response.data;
  }
};
