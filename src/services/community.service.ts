import { apiClient } from './apiClient';
import type { Community } from '../types';

export const communityService = {
  getCommunities: async (page = 1, limit = 20): Promise<{ data: Community[] }> => {
    const response = await apiClient.get(`/communities?page=${page}&limit=${limit}`);
    return response.data;
  },

  getCommunityDetail: async (id: string): Promise<{ data: Community }> => {
    const response = await apiClient.get(`/communities/${id}`);
    return response.data;
  },

  joinCommunity: async (id: string) => {
    const response = await apiClient.post(`/communities/${id}/join`);
    return response.data;
  },

  leaveCommunity: async (id: string) => {
    const response = await apiClient.post(`/communities/${id}/leave`);
    return response.data;
  }
};
