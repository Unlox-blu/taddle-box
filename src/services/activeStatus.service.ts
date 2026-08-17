import { apiClient } from './apiClient';

export const activeStatusService = {
  // Bulk active status for avatars — server only returns self + followed users.
  getBatch: async (userIds: string[]) => {
    const res = await apiClient.post(`/active-status/batch`, { userIds });
    return res.data;
  },
};
