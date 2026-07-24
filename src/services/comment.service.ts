import { apiClient } from './apiClient';

export interface CommentAuthor {
  id: string;
  name: string;
  username: string;
  avatarUrl?: string;
  isVerified?: boolean;
}

export interface Comment {
  id: string;
  postId: string;
  parentId: string | null;
  content: string;
  depth: number;
  path: string[];
  likesCount: number;
  status: string;
  author: CommentAuthor;
  createdAt: string;
  updatedAt: string;
  
  // Custom frontend fields
  isLiked?: boolean;
  replies?: number;
  hasFetchedReplies?: boolean;
}

export const commentService = {
  getComments: async (postId: string, parentId: string | null = null, page: number = 1, limit: number = 20) => {
    const params: any = { page, limit };
    if (parentId) params.parentId = parentId;
    const response = await apiClient.get(`/comments/${postId}`, { params });
    return response.data;
  },

  createComment: async (postId: string, content: string, parentId: string | null = null) => {
    const payload: any = { postId, content };
    if (parentId) payload.parentId = parentId;
    const response = await apiClient.post('/comments', payload);
    return response.data;
  },

  updateComment: async (commentId: string, content: string) => {
    const response = await apiClient.patch(`/comments/${commentId}`, { content });
    return response.data;
  },

  deleteComment: async (commentId: string) => {
    const response = await apiClient.delete(`/comments/${commentId}`);
    return response.data;
  },

  likeComment: async (commentId: string) => {
    const response = await apiClient.post(`/comments/${commentId}/like`);
    return response.data;
  },

  unlikeComment: async (commentId: string) => {
    const response = await apiClient.delete(`/comments/${commentId}/like`);
    return response.data;
  }
};
