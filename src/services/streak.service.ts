import { apiClient } from './apiClient';

export interface Streak {
  id: string;
  userId: string;
  streakCount: number;
  startDate: string;
  endDate: string;
  restoreDeadline?: string | null;
  lastRewardedDay?: number;
}

/** Shape returned by GET /streak and POST /streak (server-owned formulas). */
export interface StreakState {
  streak: Streak | null;
  restorable: boolean;
  restoreCost: number;
  restoreDeadline: string | null;
  nextMilestoneDay: number;
  nextRewardXp: number;
  /** present only from createOrUpdate */
  rewardEarned?: boolean;
  rewardXp?: number;
  /** present only from restoreStreak */
  costPaid?: number;
}

export const streakService = {
  getCurrentStreak: async (): Promise<{ data: StreakState }> => {
    const response = await apiClient.get('/streak');
    return response.data;
  },

  createOrUpdate: async (): Promise<{ data: StreakState }> => {
    const response = await apiClient.post('/streak');
    return response.data;
  },

  /** Pay XP to revive a frozen streak within its 24-hour restore window. */
  restoreStreak: async (): Promise<{ data: StreakState }> => {
    const response = await apiClient.post('/streak/restore');
    return response.data;
  },

  getStreakHistory: async (page = 1, limit = 10): Promise<{ data: Streak[] }> => {
    const response = await apiClient.get(`/streak/history?page=${page}&limit=${limit}`);
    return response.data;
  }
};
