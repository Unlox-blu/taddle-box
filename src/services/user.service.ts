import { apiClient } from "./apiClient";

export const userService = {
  searchUsers: async (q = "") => {
    const res = await apiClient.get(`/search?type=people&q=${encodeURIComponent(q)}`);
    if (res.data?.data && Array.isArray(res.data.data.data)) {
        return { data: res.data.data.data };
    }
    if (res.data?.data && Array.isArray(res.data.data)) {
        return { data: res.data.data };
    }
    return { data: [] };
  },

  getProfile: async (username: string) => {
    const res = await apiClient.get(`/users/${username}`);
    return res.data;
  },

  updatePrivacy: async (privacy: 'public' | 'private') => {
    const res = await apiClient.patch(`/users/update-privacy`, { privacy });
    return res.data;
  },

  getFollowRequests: async () => {
    const res = await apiClient.get(`/users/follow-requests`);
    return res.data;
  },

  acceptAllFollowRequests: async () => {
    const res = await apiClient.post(`/users/follow-requests/accept-all`);
    return res.data;
  },

  approveFollowRequest: async (followerId: string) => {
    const res = await apiClient.patch(`/users/${followerId}/approve-follower`);
    return res.data;
  },

  rejectFollowRequest: async (followerId: string) => {
    const res = await apiClient.delete(`/users/${followerId}/reject-follower`);
    return res.data;
  },

  followUser: async (username: string) => {
    const res = await apiClient.post(`/users/${username}/follow`);
    return res.data;
  },

  unfollowUser: async (username: string) => {
    const res = await apiClient.delete(`/users/${username}/unfollow`);
    return res.data;
  },

  // Own profile only — removes `username` from YOUR followers list.
  removeFollower: async (username: string) => {
    const res = await apiClient.delete(`/users/${username}/remove-follower`);
    return res.data;
  },

  getFollowers: async (username: string, page = 1, limit = 20) => {
    const res = await apiClient.get(`/users/${username}/followers?page=${page}&limit=${limit}`);
    return res.data;
  },

  // Users the viewer follows who also follow this profile (Instagram-style).
  getMutuals: async (username: string, page = 1, limit = 20) => {
    const res = await apiClient.get(`/users/${username}/mutuals?page=${page}&limit=${limit}`);
    return res.data;
  },

  getFollowing: async (username: string, page = 1, limit = 20) => {
    const res = await apiClient.get(`/users/${username}/following?page=${page}&limit=${limit}`);
    return res.data;
  },

  // Bulk presence for avatars — server only returns self + followed users.
  getPresenceBatch: async (userIds: string[]) => {
    const res = await apiClient.post(`/users/presence`, { userIds });
    return res.data;
  },

  // GEO location capture (permission-gated). Appends a history row server-side
  // with optional free-text place; distinct from the PROFILE location
  // (users.location) declared at signup.
  recordLocation: async (loc: {
    lat: number;
    lng: number;
    accuracy?: number;
    place?: string;
  }) => {
    const res = await apiClient.post(`/users/location`, loc);
    return res.data;
  },

  // Privacy: wipe all captured location history for this user.
  clearLocationData: async () => {
    const res = await apiClient.delete(`/users/location`);
    return res.data;
  },
};
