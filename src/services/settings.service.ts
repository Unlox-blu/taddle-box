import { apiClient } from './apiClient';

export const settingsService = {
  getSettings: async () => {
    const response = await apiClient.get('/settings');
    return response.data;
  },

  toggleNotifXP: async () => {
    const response = await apiClient.patch('/settings/notifxp');
    return response.data;
  },

  toggleNotifWithdraw: async () => {
    const response = await apiClient.patch('/settings/notifwithdraw');
    return response.data;
  },

  toggleNotifPromos: async () => {
    const response = await apiClient.patch('/settings/notifpromos');
    return response.data;
  },

  togglePublicAccount: async () => {
    const response = await apiClient.patch('/settings/publicaccount');
    return response.data;
  },

  toggleActivityStatus: async () => {
    const response = await apiClient.patch('/settings/activitystatus');
    return response.data;
  },

  toggleAllowTagging: async () => {
    const response = await apiClient.patch('/settings/allowtagging');
    return response.data;
  },

  toggleAllowReposts: async () => {
    const response = await apiClient.patch('/settings/allowreposts');
    return response.data;
  },

  toggleShowOnLeaderboard: async () => {
    const response = await apiClient.patch('/settings/showonleaderboard');
    return response.data;
  }
};
