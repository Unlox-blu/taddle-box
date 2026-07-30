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

  getMembers: async (id: string, page = 1, limit = 20): Promise<{ data: any[]; meta?: any }> => {
    const response = await apiClient.get(`/communities/${id}/members?page=${page}&limit=${limit}`);
    return response.data;
  },

  removeMember: async (communityId: string, userId: string) => {
    const response = await apiClient.delete(`/communities/${communityId}/members/${userId}`);
    return response.data;
  },

  createCommunity: async (data: Partial<Community>) => {
    const response = await apiClient.post('/communities/create-community', data);
    return response.data;
  },

  getRequests: async (id: string, page = 1, limit = 20): Promise<{ data: any[]; meta?: any }> => {
    const response = await apiClient.get(`/communities/${id}/requests?page=${page}&limit=${limit}`);
    return response.data;
  },

  approveRequest: async (communityId: string, userId: string) => {
    const response = await apiClient.post(`/communities/${communityId}/members/${userId}/approve`);
    return response.data;
  },

  rejectRequest: async (communityId: string, userId: string) => {
    const response = await apiClient.delete(`/communities/${communityId}/members/${userId}`);
    return response.data;
  },

  updateCommunity: async (communityId: string, data: any) => {
    const response = await apiClient.patch(`/communities/${communityId}/update-community`, data);
    return response.data;
  },

  updateAvatar: async (communityId: string, avatarMediaId: string) => {
    const response = await apiClient.patch(`/communities/${communityId}/update-community-avatar`, { avatarMediaId });
    return response.data;
  },

  updateBanner: async (communityId: string, bannerMediaId: string) => {
    const response = await apiClient.patch(`/communities/${communityId}/update-community-banner`, { bannerMediaId });
    return response.data;
  },

  deleteCommunity: async (communityId: string) => {
    const response = await apiClient.delete(`/communities/${communityId}`);
    return response.data;
  }
};
