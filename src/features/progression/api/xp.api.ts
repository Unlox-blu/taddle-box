import { apiClient } from '../../../infrastructure/api/api-client';

export const xpService = {
  getXP: async () => {
    const response = await apiClient.get('/xp');
    return response.data;
  },

  /**
   * Claim a platform XP reward by EVENT NAME. The client sends only the
   * event (e.g. 'daily_login', 'post_view') plus the minimal identifying
   * payload (e.g. { postId }). The backend computes the amount, builds the
   * source string, and verifies the claim — never send an amount here.
   */
  claimReward: async (event: string, payload?: Record<string, unknown>) => {
    const response = await apiClient.post('/xp/claim', { event, payload });
    return response.data;
  },

  /** Fetch XP transactions. `q` searches the FULL history server-side
      (type/source/status/amount); `time` narrows by window and `sort` is
      'top' (biggest XP first) or anything else = newest-first — all applied
      server-side so pagination stays correct past page 1. */
  getTransactions: async (page = 1, limit = 20, q = '', time?: string, sort?: string) => {
    const timeParam = time && time !== 'all_time' ? `&time=${encodeURIComponent(time)}` : '';
    const sortParam = sort && sort !== 'relevance' ? `&sort=${encodeURIComponent(sort)}` : '';
    const query = `page=${page}&limit=${limit}${q ? `&q=${encodeURIComponent(q)}` : ''}${timeParam}${sortParam}`;
    const response = await apiClient.get(`/xp/transactions?${query}`);
    return response.data;
  },

  // Cheap per-day check (no full history fetch): true if the login reward
  // for today (server-local date) has already been credited.
  getDailyLoginStatus: async () => {
    const response = await apiClient.get('/xp/daily-login-status');
    return response.data;
  },
};