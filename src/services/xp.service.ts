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

  getTransactions: async (page = 1, limit = 20) => {
    const response = await apiClient.get(`/xp/transactions?page=${page}&limit=${limit}`);
    return response.data;
  },

  // Cheap per-day check (no full history fetch): true if the login reward for
  // the given local date (YYYY-MM-DD) has already been credited.
  getDailyLoginStatus: async (date: string) => {
    const response = await apiClient.get(`/xp/daily-login-status?date=${date}`);
    return response.data;
  },
};
