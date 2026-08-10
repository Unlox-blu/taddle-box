import { apiClient } from './apiClient';
import type { Post } from '../types';

export const postsService = {
  getFeed: async (page = 1, limit = 20, hashtag?: string): Promise<{ data: Post[] }> => {
    let url = `/feed?page=${page}&limit=${limit}`;
    if (hashtag && hashtag !== 'All') url += `&hashtag=${encodeURIComponent(hashtag)}`;
    const response = await apiClient.get(url);
    return response.data;
  },

  getBookmarks: async (page = 1, limit = 20): Promise<{ data: Post[] }> => {
    const response = await apiClient.get(`/bookmark?page=${page}&limit=${limit}`);
    return response.data;
  },

  createPost: async (postData: any): Promise<{ data: Post }> => {
    const response = await apiClient.post('/posts/create-post', postData);
    return response.data;
  },

  getPost: async (postId: string): Promise<{ data: Post }> => {
    const response = await apiClient.get(`/posts/${postId}`);
    return response.data;
  },

  // Record a post impression (thread opened). Fire-and-forget — the server
  // never fails this for a deleted post, so the caller can ignore errors.
  recordView: async (postId: string) => {
    const response = await apiClient.post(`/posts/${postId}/view`);
    return response.data;
  },

  // Paginated list of users who liked a post, each with the viewer's follow
  // state (isFollowing / isFollower) for Follow/Unfollow buttons.
  getLikers: async (
    postId: string,
    page = 1,
    limit = 20,
  ): Promise<{ data: any[] }> => {
    const response = await apiClient.get(
      `/posts/${postId}/likes?page=${page}&limit=${limit}`,
    );
    return response.data;
  },

  // Paginated list of users who reposted a post — same shape as getLikers so
  // the same users-list modal can render Follow/Unfollow buttons.
  getReposters: async (
    postId: string,
    page = 1,
    limit = 20,
  ): Promise<{ data: any[] }> => {
    const response = await apiClient.get(
      `/posts/${postId}/reposts?page=${page}&limit=${limit}`,
    );
    return response.data;
  },

  // type: 'all' | 'posts' (originals only) | 'reposts' (repost rows only)
  getUserPosts: async (
    authorId: string,
    page = 1,
    limit = 20,
    type: 'all' | 'posts' | 'reposts' = 'all',
  ): Promise<{ data: Post[] }> => {
    const response = await apiClient.get(
      `/posts/user/${authorId}?page=${page}&limit=${limit}&type=${type}`,
    );
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

  deletePost: async (postId: string) => {
    const response = await apiClient.delete(`/posts/${postId}`);
    return response.data;
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

  // Repost a post verbatim, or with the user's own thoughts (quote repost).
  // Quote reposts support hashtags + mentions like a normal post.
  repostPost: async (
    postId: string,
    content?: string,
    opts?: { tags?: string[]; mentions?: string[]; communityId?: string },
  ): Promise<{ data: Post }> => {
    const response = await apiClient.post(`/posts/${postId}/repost`, {
      content,
      tags: opts?.tags,
      mentions: opts?.mentions,
      communityId: opts?.communityId,
    });
    return response.data;
  },

  // Remove the current user's repost of a post (repost toggle off).
  unrepostPost: async (postId: string) => {
    const response = await apiClient.delete(`/posts/${postId}/repost`);
    return response.data;
  },
};
