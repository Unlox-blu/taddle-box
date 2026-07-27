import { apiClient } from './apiClient';
import type { User } from '../types';

export const authService = {
  login: async (email: string, password?: string) => {
    // Assuming backend takes email/password or something similar
    const response = await apiClient.post('/auth/login', { email, password });
    return response.data; // Expected to return tokens and user data
  },
  
  sendOtp: async (data: { email: string; countryCode: string; phone: string; socialToken?: string }) => {
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

  getMe: async (): Promise<{ data: { user: User } }> => {
    const response = await apiClient.get('/auth/me');
    return response.data;
  },

  logout: async () => {
    const response = await apiClient.post('/auth/logout');
    return response.data;
  },

  appleLogin: async (identityToken: string, fullName?: string) => {
    const response = await apiClient.post('/auth/apple', { identityToken, fullName });
    return response.data;
  },

  deleteAccount: async () => {
    const response = await apiClient.delete('/users/me');
    return response.data;
  },

  checkUsername: async (username: string) => {
    const response = await apiClient.post('/auth/username', { username });
    return response.data;
  },

  setupPin: async (pin: string, enableGlobal: boolean = true) => {
    const response = await apiClient.post('/users/pin/setup', { pin, enableGlobal });
    return response.data;
  },

  verifyPin: async (pin: string) => {
    const response = await apiClient.post('/users/pin/verify', { pin });
    return response.data;
  },

  toggleGlobalAppLock: async (pin: string, isEnabled: boolean) => {
    const response = await apiClient.post('/users/pin/toggle-global', { pin, isEnabled });
    return response.data;
  },

  resetPin: async (password: string, newPin: string) => {
    const response = await apiClient.post('/users/pin/reset', { password, newPin });
    return response.data;
  },

  removePin: async (pin: string) => {
    const response = await apiClient.post('/users/pin/remove', { pin });
    return response.data;
  },

  updateProfile: async (data: { name?: string; bio?: string; websiteUrl?: string }) => {
    const response = await apiClient.patch('/users/update-profile', data);
    return response.data;
  },

  updateUsername: async (username: string) => {
    const response = await apiClient.patch('/users/update-username', { username });
    return response.data;
  },

  updateAvatar: async (avatarMediaId: string) => {
    const response = await apiClient.patch('/users/update-avatar', { avatarMediaId });
    return response.data;
  },

  changePassword: async (data: { currentPassword?: string; newPassword?: string }) => {
    const response = await apiClient.post('/auth/change-password', data);
    return response.data;
  },

  forgotPassword: async (email: string) => {
    const response = await apiClient.post('/auth/forgot-password', { email });
    return response.data;
  },

  resetPassword: async (data: { email: string; emailOtp: string; phoneOtp?: string; password: string }) => {
    const response = await apiClient.post('/auth/reset-password', data);
    return response.data;
  },

  verifyPassword: async (password: string) => {
    const response = await apiClient.post('/auth/verify-password', { password });
    return response.data;
  },

  sendPhoneOtp: async (data: { countryCode: string; phone: string; purpose: string }) => {
    const response = await apiClient.post('/auth/send-phone-otp', data);
    return response.data;
  },

  sendEmailOtp: async (data: { email: string; purpose: string }) => {
    const response = await apiClient.post('/auth/send-email-otp', data);
    return response.data;
  },

  verifyPhoneOtp: async (data: { otp: string; purpose: string }) => {
    const response = await apiClient.post('/auth/verify-phone-otp', data);
    return response.data;
  },

  verifyEmailOtp: async (data: { otp: string; purpose: string }) => {
    const response = await apiClient.post('/auth/verify-email-otp', data);
    return response.data;
  },

  updatePhone: async (data: { changeToken: string; countryCode: string; phone: string }) => {
    const response = await apiClient.patch('/auth/update-phone', data);
    return response.data;
  },

  updateEmail: async (data: { changeToken: string; email: string }) => {
    const response = await apiClient.patch('/auth/update-email', data);
    return response.data;
  },
};
