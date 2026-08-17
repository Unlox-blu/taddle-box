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
  /**
   * Weekly leaderboards. Pass `type` to fetch ONLY that tab — the live
   * leaderboards:changed refresh path fetches the active tab instead of the
   * full four-tab bundle; omit it for the initial load / pull-to-refresh.
   */
  getWeekly: async (limit = 20, type?: LeaderboardType): Promise<{ data: WeeklyLeaderboards }> => {
    let url = `/leaderboards/weekly?limit=${limit}`;
    if (type) url += `&type=${type}`;
    const response = await apiClient.get(url);
    return response.data;
  },
};
