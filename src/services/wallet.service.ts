import { apiClient } from './apiClient';
import type { Transaction } from '../types';

export const walletService = {
  getWallet: async () => {
    const response = await apiClient.get('/wallet/me');
    return response.data;
  },

  getTransactions: async (page = 1, limit = 20) => {
    const response = await apiClient.get(`/wallet/me/transactions?page=${page}&limit=${limit}`);
    return response.data;
  },

  convertXpToCash: async (xpAmount: number) => {
    const response = await apiClient.post('/wallet/convert-xp', { xpAmount });
    return response.data;
  },

  initiateWithdrawal: async (amountCents: number) => {
    const response = await apiClient.post('/wallet/withdraw/initiate', { amountCents });
    return response.data;
  },

  linkUPI: async (upiId: string) => {
    const response = await apiClient.post('/wallet/upi', { upiId });
    return response.data;
  }
};
