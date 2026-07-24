import { apiClient } from './apiClient';

export interface AppConfig {
  latestVersion: string;
  minimumVersion: string;
  storeUrl: string;
}

export const appConfigService = {
  getAppConfig: async (): Promise<{ data: AppConfig }> => {
    const response = await apiClient.get('/app-config');
    return response.data;
  },
};
