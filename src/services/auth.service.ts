import { apiClient } from './apiClient';
import type { User } from '../types';

export const authService = {
  login: async (email: string, password?: string) => {
    // Assuming backend takes email/password or something similar
    const response = await apiClient.post('/auth/login', { email, password });
    return response.data; // Expected to return tokens and user data
  },
  
  sendOtp: async (data: { email: string; countryCode: string; phone: string }) => {
    const response = await apiClient.post('/auth/send-otp', data);
    return response.data;
  },

  verifyOtp: async (data: { emailOtp: string; phoneOtp: string }, token?: string) => {
    const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
    const response = await apiClient.post('/auth/verify-otp', data, config);
    return response.data;
  },

  signup: async (data: any, token?: string) => {
    const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
    const response = await apiClient.post('/auth/signup', data, config);
    return response.data;
  },

  getMe: async (): Promise<{ data: User }> => {
    const response = await apiClient.get('/auth/me');
    return response.data;
  },

  logout: async () => {
    const response = await apiClient.post('/auth/logout');
    return response.data;
  },
};
