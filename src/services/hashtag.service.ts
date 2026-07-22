import { apiClient } from "./apiClient";

export const hashtagService = {
  getHashtags: async (q = "") => {
    const res = await apiClient.get(`/search/hashtags?q=${encodeURIComponent(q)}`);
    if (res.data?.data && Array.isArray(res.data.data.data)) {
        return { data: res.data.data.data };
    }
    if (res.data?.data && Array.isArray(res.data.data)) {
        return { data: res.data.data };
    }
    return { data: [] };
  },
};
