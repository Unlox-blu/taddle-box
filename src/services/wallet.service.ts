import { apiClient } from './apiClient';
import type { Transaction } from '../types';

export const walletService = {
  getWallet: async () => {
    const response = await apiClient.get('/wallet/me');
    return response.data;
  },

  /** Lightweight balance-only summary — cash/held/XP counts, no transactions. */
  getWalletSummary: async () => {
    const response = await apiClient.get('/wallet/me/summary');
    return response.data;
  },

  /** Fetch wallet transactions. `q` searches the FULL history server-side
      (description/type/category/status/amount) — not just the first page. */
  getTransactions: async (page = 1, limit = 20, q = '') => {
    const query = `page=${page}&limit=${limit}${q ? `&q=${encodeURIComponent(q)}` : ''}`;
    const response = await apiClient.get(`/wallet/me/transactions?${query}`);
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
  },

  /** Start a PayU wallet recharge — returns an auto-submitting HTML form. */
  initiateRecharge: async (amountCents: number) => {
    const response = await apiClient.post('/wallet/recharge/init', { amountCents });
    return response.data;
  },

  /** Buy XP with cash wallet balance. */
  convertCashToXp: async (amountCents: number) => {
    const response = await apiClient.post('/wallet/convert-cash-xp', { amountCents });
    return response.data;
  }
};
