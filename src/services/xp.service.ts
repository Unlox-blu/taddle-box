import { apiClient } from './apiClient';

export const xpService = {
  getXP: async () => {
    const response = await apiClient.get('/xp');
    return response.data;
  },

  creditXP: async (xp: number, transactionType: string, sourceType: string) => {
    const response = await apiClient.post('/xp/credit', { xp, transactionType, sourceType });
    return response.data;
  },
  
  debitXP: async (xp: number, transactionType: string, sourceType: string) => {
    const response = await apiClient.post('/xp/debit', { xp, transactionType, sourceType });
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

  // Cheap per-day check (no full history fetch): true if the login reward for
  // the given local date (YYYY-MM-DD) has already been credited.
  getDailyLoginStatus: async (date: string) => {
    const response = await apiClient.get(`/xp/daily-login-status?date=${date}`);
    return response.data;
  },
};
