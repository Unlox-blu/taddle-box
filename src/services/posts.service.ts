import { apiClient } from './apiClient';
import type { Post } from '../types';

export const postsService = {
  getFeed: async (page = 1, limit = 20, hashtag?: string): Promise<{ data: Post[] }> => {
    let url = `/feed/home?page=${page}&limit=${limit}`;
    if (hashtag && hashtag !== 'All') url += `&hashtag=${encodeURIComponent(hashtag)}`;
    const response = await apiClient.get(url);
    return response.data;
  },

  /** User-personalized trending hashtags for the Home chips row
      (feed-relevant — not the global search-page hashtag ranking). */
  getFeedHashtags: async (): Promise<{ data: string[] }> => {
    const response = await apiClient.get(`/feed/hashtags`);
    return { data: response.data?.data || [] };
  },

  getBookmarks: async (page = 1, limit = 20): Promise<{ data: Post[] }> => {
    const response = await apiClient.get(`/bookmark?page=${page}&limit=${limit}`);
    return response.data;
  },

  // Multi-type bookmarks
  getBookmarksByType: async (type: string, page = 1, limit = 20) => {
    const response = await apiClient.get(`/bookmark?type=${type}&page=${page}&limit=${limit}`);
    return response.data;
  },

  toggleBookmark: async (itemType: string, itemId: string) => {
    const response = await apiClient.post('/bookmark/toggle', { itemType, itemId });
    return response.data;
  },

  checkBookmark: async (itemType: string, itemId: string): Promise<{ data: { bookmarked: boolean } }> => {
    const response = await apiClient.get(`/bookmark/check?type=${itemType}&itemId=${itemId}`);
    return response.data;
  },

  createPost: async (postData: any): Promise<{ data: Post }> => {
    const response = await apiClient.post('/posts/create-post', postData);
    return response.data;
  },

  // Cast (or move) the current user's vote on a post poll. The server enforces
  // one vote per user; a re-vote on a different option moves the tally.
  castPollVote: async (
    postId: string,
    optionIndex: number,
  ): Promise<{ data: { pollData: Post['pollData']; myVote: number; changed: boolean } }> => {
    const response = await apiClient.post(`/posts/${postId}/poll/vote`, { optionIndex });
    return response.data;
  },

  // The poll author stops further votes (server enforces authorship).
  closePoll: async (
    postId: string,
  ): Promise<{ data: { pollData: Post['pollData']; closed: boolean } }> => {
    const response = await apiClient.post(`/posts/${postId}/poll/close`);
    return response.data;
  },

  getPost: async (postId: string, config?: { viaRepostId?: string }): Promise<{ data: Post }> => {
    let url = `/posts/${postId}`;
    if (config?.viaRepostId) {
      url += `?via_repost=${encodeURIComponent(config.viaRepostId)}`;
    }
    const response = await apiClient.get(url);
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
    search?: string
  ): Promise<{ data: any[] }> => {
    let url = `/posts/${postId}/likes?page=${page}&limit=${limit}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    const response = await apiClient.get(url);
    return response.data;
  },

  // Paginated list of users who reposted a post — same shape as getLikers so
  // the same users-list modal can render Follow/Unfollow buttons.
  getReposters: async (
    postId: string,
    page = 1,
    limit = 20,
    search?: string
  ): Promise<{ data: any[] }> => {
    let url = `/posts/${postId}/reposts?page=${page}&limit=${limit}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    const response = await apiClient.get(url);
    return response.data;
  },

  // Paginated list of users who voted for ONE option of a post poll — same
  // shape as getLikers so the same users-list modal renders it, with
  // privacy + followRequested so the Follow button can become
  // "Request to Follow" for private accounts.
  getPollVoters: async (
    postId: string,
    optionIndex: number,
    page = 1,
    limit = 20,
    search?: string
  ): Promise<{ data: any[] }> => {
    let url = `/posts/${postId}/poll/voters?option=${optionIndex}&page=${page}&limit=${limit}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    const response = await apiClient.get(url);
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
      `/feed/user/${authorId}?page=${page}&limit=${limit}&type=${type}`,
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
