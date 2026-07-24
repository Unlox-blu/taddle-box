import { apiClient } from './apiClient';

export interface Streak {
  id: string;
  userId: string;
  streakCount: number;
  startDate: string;
  endDate: string;
}

export const streakService = {
  getCurrentStreak: async (): Promise<{ data: Streak }> => {
    const response = await apiClient.get('/streak');
    return response.data;
  },

  createOrUpdate: async (): Promise<{ data: { streak: Streak; weeklyBonusEarned: boolean } }> => {
    const response = await apiClient.post('/streak');
    return response.data;
  },

  getStreakHistory: async (page = 1, limit = 10): Promise<{ data: Streak[] }> => {
    const response = await apiClient.get(`/streak/history?page=${page}&limit=${limit}`);
    return response.data;
  }
};
