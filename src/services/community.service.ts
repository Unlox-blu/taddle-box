import { apiClient } from './apiClient';
import type { Community, Post } from '../types';

export const communityService = {
  getCommunities: async (page = 1, limit = 20, search?: string, mine?: boolean, category?: string, filter?: string): Promise<{ data: Community[]; meta?: any }> => {
    const params: any = { page, limit };
    if (search) params.search = search;
    if (mine) params.mine = 'true';
    if (category) params.category = category;
    if (filter) params.filter = filter;
    const response = await apiClient.get('/communities/discover', { params });
    return response.data;
  },

  getCommunityCategories: async (): Promise<{ data: string[] }> => {
    const response = await apiClient.get('/communities/categories');
    return response.data;
  },

  getCommunityDetail: async (slug: string): Promise<{ data: Community }> => {
    const response = await apiClient.get(`/communities/${slug}`);
    return response.data;
  },

  /** Resolve a community by id (share endpoint) — used to deep-link community
      notifications that only carry the community id. */
  getCommunityById: async (id: string): Promise<{ data: Community }> => {
    const response = await apiClient.get(`/share/community/${id}`);
    return response.data;
  },

  getCommunityPosts: async (id: string, page = 1, limit = 20): Promise<{ data: Post[]; meta?: any }> => {
    const response = await apiClient.get(`/feed/community/${id}?page=${page}&limit=${limit}`);
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

  getMembers: async (id: string, page = 1, limit = 20, search?: string): Promise<{ data: any[]; meta?: any; ownerId?: string; viewerRole?: string }> => {
    let url = `/communities/${id}/members?page=${page}&limit=${limit}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    const response = await apiClient.get(url);
    return response.data;
  },

  removeMember: async (communityId: string, userId: string) => {
    const response = await apiClient.delete(`/communities/${communityId}/members/${userId}`);
    return response.data;
  },

  /** Owner/admins only: paginated history of moderation actions in the community. */
  getModerationLog: async (id: string, page = 1, limit = 20): Promise<{ data: any[]; meta?: any }> => {
    const response = await apiClient.get(`/communities/${id}/moderation-log?page=${page}&limit=${limit}`);
    return response.data;
  },

  /** Owner-only: promote a member to admin or demote an admin to member. */
  updateMemberRole: async (communityId: string, userId: string, role: 'admin' | 'member') => {
    const response = await apiClient.patch(`/communities/${communityId}/members/${userId}/role`, { role });
    return response.data;
  },

  /** Owner-only: hand the community to another active member (old owner becomes admin). */
  transferOwnership: async (communityId: string, userId: string) => {
    const response = await apiClient.post(`/communities/${communityId}/transfer-ownership`, { userId });
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
