import { apiClient, getDeviceId } from './apiClient';
import type { User } from '../types';

export const authService = {
  login: async (identifier: string, password?: string) => {
    const deviceId = await getDeviceId();
    const response = await apiClient.post('/auth/login', { identifier, password, deviceId });
    return response.data;
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
    const deviceId = await getDeviceId();
    const response = await apiClient.post('/auth/signup', { ...data, deviceId }, config);
    return response.data;
  },

  getMe: async (): Promise<{ data: { user: User } }> => {
    const response = await apiClient.get('/auth/me');
    return response.data;
  },

  logout: async (token?: string) => {
    // Include sessionId so the backend revokes only this device's session
    const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
    const response = await apiClient.post('/auth/logout', {}, config);
    return response.data;
  },

  appleLogin: async (identityToken: string, fullName?: string) => {
    const deviceId = await getDeviceId();
    const response = await apiClient.post('/auth/apple', { identityToken, fullName, deviceId });
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

  toggleGlobalLock: async (pin: string, isEnabled: boolean) => {
    const response = await apiClient.post('/users/pin/toggle-global', { pin, isEnabled });
    return response.data;
  },

  toggleWalletLock: async (pin: string, isEnabled: boolean) => {
    const response = await apiClient.post('/users/pin/toggle-wallet', { pin, isEnabled });
    return response.data;
  },

  removePinSendOtp: async () => {
    const response = await apiClient.post('/users/pin/remove/send-otp');
    return response.data;
  },

  removePinVerify: async (password: string, emailOtp: string, phoneOtp?: string) => {
    const response = await apiClient.post('/users/pin/remove/verify', { password, emailOtp, phoneOtp });
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

  // Every editable profile field the API accepts — mirrors the signup form so
  // users can change anything they set at registration.
  updateProfile: async (data: {
    name?: string;
    bio?: string;
    websiteUrl?: string;
    location?: string;
    organization?: string;
    occupation?: string;
    gender?: 'male' | 'female' | 'other';
    dateOfBirth?: string; // 'YYYY-MM-DD'
    interests?: string[];
  }) => {
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

  updateBanner: async (bannerMediaId: string) => {
    const response = await apiClient.patch('/users/update-banner', { bannerMediaId });
    return response.data;
  },

  changePassword: async (data: { currentPassword?: string; email?: string; countryCode?: string; phone?: string }) => {
    const response = await apiClient.post('/auth/change-password', data);
    return response.data;
  },

  verifyChangePasswordOtp: async (data: { emailOtp: string; phoneOtp?: string }) => {
    const response = await apiClient.post('/auth/verify-change-password-otp', data);
    return response.data;
  },

  confirmChangePassword: async (data: { changeToken: string; newPassword: string }) => {
    const response = await apiClient.post('/auth/confirm-change-password', data);
    return response.data;
  },

  forgotPassword: async (identifier: string) => {
    const response = await apiClient.post('/auth/forgot-password', { identifier });
    return response.data;
  },

  verifyResetPasswordOtp: async (data: { email: string; emailOtp: string; phoneOtp?: string }) => {
    const response = await apiClient.post('/auth/verify-reset-password-otp', data);
    return response.data;
  },

  resetPassword: async (data: { token: string; password: string }) => {
    const response = await apiClient.post('/auth/reset-password', data);
    return response.data;
  },

  verifyPassword: async (data: { password: string; email?: string; countryCode?: string; phone?: string }) => {
    const response = await apiClient.post('/auth/verify-password', data);
    return response.data;
  },

  requestChangePhoneOtp: async (data: { newCountryCode: string; newPhone: string }) => {
    const response = await apiClient.post('/auth/change-phone/request-otp', data);
    return response.data;
  },

  verifyChangePhoneOtp: async (data: { emailOtp: string; phoneOtp: string }) => {
    const response = await apiClient.patch('/auth/change-phone/verify-update', data);
    return response.data;
  },

  requestChangeEmailOtp: async (data: { newEmail: string }) => {
    const response = await apiClient.post('/auth/change-email/request-otp', data);
    return response.data;
  },

  verifyChangeEmailOtp: async (data: { emailOtp: string; phoneOtp?: string }) => {
    const response = await apiClient.patch('/auth/change-email/verify-update', data);
    return response.data;
  },
};
