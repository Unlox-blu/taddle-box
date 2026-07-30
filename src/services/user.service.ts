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

  followUser: async (username: string) => {
    const res = await apiClient.post(`/users/${username}/follow`);
    return res.data;
  },

  unfollowUser: async (username: string) => {
    const res = await apiClient.delete(`/users/${username}/unfollow`);
    return res.data;
  },

  getFollowers: async (username: string) => {
    const res = await apiClient.get(`/users/${username}/followers`);
    return res.data;
  },

  getFollowing: async (username: string) => {
    const res = await apiClient.get(`/users/${username}/following`);
    return res.data;
  },
};
