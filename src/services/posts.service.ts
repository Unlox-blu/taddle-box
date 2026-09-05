import { apiClient } from './apiClient';
import type { Post } from '../types';

export const postsService = {
  getFeed: async (page = 1, limit = 20, hashtag?: string): Promise<{ data: any[] }> => {
    let url = `/feed/home?page=${page}&limit=${limit}`;
    if (hashtag && hashtag !== 'All') url += `&hashtag=${encodeURIComponent(hashtag)}`;
    const response = await apiClient.get(url);
    return { data: response.data?.data?.items || [] };
  },

  /** User-personalized trending hashtags for the Home chips row */
  getFeedHashtags: async (): Promise<{ data: string[] }> => {
    const response = await apiClient.get(`/feed/hashtags`);
    return { data: response.data?.data || [] };
  },

  getBookmarks: async (page = 1, limit = 20): Promise<{ data: any[] }> => {
    const response = await apiClient.get(`/bookmark?page=${page}&limit=${limit}`);
    return { data: response.data?.data?.items || [] };
  },

  getBookmarksByType: async (type: string, page = 1, limit = 20) => {
    const response = await apiClient.get(`/bookmark?type=${type}&page=${page}&limit=${limit}`);
    return { data: response.data?.data?.items || [] };
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

  castPollVote: async (
    postId: string,
    optionIndex: number,
  ): Promise<{ data: { pollData: Post['pollData']; myVote: number; changed: boolean } }> => {
    const response = await apiClient.post(`/posts/${postId}/poll/vote`, { optionIndex });
    return response.data;
  },

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

  recordView: async (postId: string) => {
    if (!postId || typeof postId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(postId)) {
      return null;
    }
    const response = await apiClient.post(`/posts/${postId}/view`);
    return response.data;
  },

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

  getUserPosts: async (
    authorId: string,
    page = 1,
    limit = 20,
    type: 'all' | 'posts' | 'reposts' = 'all',
  ): Promise<{ data: any[] }> => {
    const response = await apiClient.get(
      `/feed/user/${authorId}?page=${page}&limit=${limit}&type=${type}`,
    );
    return { data: response.data?.data?.items || [] };
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

  unrepostPost: async (postId: string) => {
    const response = await apiClient.delete(`/posts/${postId}/repost`);
    return response.data;
  },

  // ── Cursor-based pagination methods ──────────────────────────────────────
  // Cursor is an opaque base64 string encoding { createdAt, id }

  getFeedCursor: async (
    limit = 20,
    cursor?: string | null,
    hashtag?: string,
    newerCursor?: string | null,
  ): Promise<{ data: any[]; pagination: { nextCursor?: string | null; hasNext?: boolean } }> => {
    let url = `/feed/home?limit=${limit}`;
    if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`;
    if (hashtag && hashtag !== 'All') url += `&hashtag=${encodeURIComponent(hashtag)}`;
    if (newerCursor) url += `&newerCursor=${encodeURIComponent(newerCursor)}`;
    const response = await apiClient.get(url);
    return {
      data: response.data?.data?.items || [],
      pagination: response.data?.data?.pagination || {},
    };
  },

  getUserPostsCursor: async (
    authorId: string,
    limit = 20,
    cursor?: string | null,
    type: 'all' | 'posts' | 'reposts' = 'all',
  ): Promise<{ data: any[]; pagination: { nextCursor?: string | null; hasNext?: boolean } }> => {
    let url = `/feed/user/${authorId}?limit=${limit}&type=${type}`;
    if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`;
    const response = await apiClient.get(url);
    return {
      data: response.data?.data?.items || [],
      pagination: response.data?.data?.pagination || {},
    };
  },

  // Check how many newer posts exist since a given cursor (for "X new reels" banner)
  getNewerCount: async (cursor: string): Promise<{ count: number }> => {
    const response = await apiClient.get(`/feed/newer-count?cursor=${encodeURIComponent(cursor)}`);
    return response.data?.data || { count: 0 };
  },

  // ── Content Session methods (unified stable ranking pagination) ───────────

  /** Create a new content session (feed or reels) */
  createContentSession: async (options: {
    sourceContext?: string;
    presentation?: string;
    seedContentIds?: string[];
    initialContentId?: string;
    feedContextId?: string;
    hashtag?: string;
  }): Promise<{
    session: { id: string; sourceContext: string; presentation: string; createdAt: string; expiresAt: string };
    posts: Post[];
    startIndex: number;
    skippedCount: number;
  }> => {
    const response = await apiClient.post('/content/sessions', options);
    const data = response.data?.data;
    return {
      session: data.session,
      posts: data.posts || [],
      startIndex: data.startIndex || 0,
      skippedCount: data.skippedCount || 0,
    };
  },

  /** Load a page of posts from an existing content session (auto-extends) */
  loadContentSessionPage: async (
    sessionId: string,
    offset: number,
    limit: number,
  ): Promise<{
    posts: Post[];
    nextOffset: number;
    hasMore: boolean;
  }> => {
    const response = await apiClient.get(
      `/content/sessions/${sessionId}?offset=${offset}&limit=${limit}`,
    );
    const data = response.data?.data;
    return {
      posts: data.items?.map((item: any) => item.data) || [],
      nextOffset: data.pagination?.nextOffset || offset,
      hasMore: data.pagination?.hasMore || false,
    };
  },
};
