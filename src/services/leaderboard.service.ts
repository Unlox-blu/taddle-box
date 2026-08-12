import { apiClient } from './apiClient';

export type LeaderboardType = 'feed' | 'community' | 'games' | 'events';

export type WeeklyLeaderboardEntry = {
  rank: number;
  type: LeaderboardType;
  id: string;
  title: string;
  subtitle?: string;
  avatarUrl?: string | null;
  score: number;
  metricLabel: string;
  rewardXP: number;
};

export type WeeklyLeaderboards = {
  weekStart: string;
  rewards: number[];
  feed: WeeklyLeaderboardEntry[];
  community: WeeklyLeaderboardEntry[];
  games: WeeklyLeaderboardEntry[];
  events: WeeklyLeaderboardEntry[];
  currentUser: {
    feed: WeeklyLeaderboardEntry | null;
    community: WeeklyLeaderboardEntry | null;
    games: WeeklyLeaderboardEntry | null;
    events: WeeklyLeaderboardEntry | null;
  };
};

export const leaderboardService = {
  getWeekly: async (limit = 20): Promise<{ data: WeeklyLeaderboards }> => {
    const response = await apiClient.get(`/leaderboards/weekly?limit=${limit}`);
    return response.data;
  },
};
