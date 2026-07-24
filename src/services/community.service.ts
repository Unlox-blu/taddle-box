import { apiClient } from './apiClient';
import type { Community, Post } from '../types';

export const communityService = {
  getCommunities: async (page = 1, limit = 20): Promise<{ data: Community[]; meta?: any }> => {
    const response = await apiClient.get(`/communities/discover?page=${page}&limit=${limit}`);
    return response.data;
  },

  getCommunityDetail: async (slug: string): Promise<{ data: Community }> => {
    const response = await apiClient.get(`/communities/${slug}`);
    return response.data;
  },

  getCommunityPosts: async (id: string, page = 1, limit = 20): Promise<{ data: Post[]; meta?: any }> => {
    const response = await apiClient.get(`/communities/${id}/posts?page=${page}&limit=${limit}`);
    return response.data;
  },

  joinCommunity: async (id: string) => {
    const response = await apiClient.post(`/communities/${id}/join`);
    return response.data;
  },

  leaveCommunity: async (id: string) => {
    const response = await apiClient.delete(`/communities/${id}/leave`);
    return response.data;
  },

  createCommunity: async (data: Partial<Community>) => {
    const response = await apiClient.post('/communities/create-community', data);
    return response.data;
  }
};
