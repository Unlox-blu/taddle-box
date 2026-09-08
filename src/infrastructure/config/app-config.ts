import { apiClient } from '../api/api-client';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { warn } from '../logging/logger';

export interface ReferralRewards {
  joinerXp: number;
  referrerXp: number;
}

export interface AppConfig {
  latestVersion: string;
  minimumVersion: string;
  storeUrl: string;
  /** Backend-controlled XP rewards (refer & earn, …) — never hardcode amounts. */
  rewards?: {
    referral: ReferralRewards;
  };
}

/** Resolves the build channel so the backend can return the right config/URL.
 *  - dev       → expo start / Expo Go
 *  - direct    → EAS internal / sideloaded APK (APP_UPDATER_ENABLED=1)
 *  - production → Play Store / App Store build
 */
function getBuildChannel(): 'dev' | 'direct' | 'store' {
  if (__DEV__) return 'dev';
  const extra = Constants.expoConfig?.extra as { appUpdater?: { enabled?: boolean } } | undefined;
  if (extra?.appUpdater?.enabled) return 'direct';
  return 'store';
}

export const appConfigService = {
  getAppConfig: async (): Promise<{ data: AppConfig }> => {
    const response = await apiClient.get('/app-config', {
      params: {
        platform: Platform.OS,       // 'android' | 'ios'
        channel: getBuildChannel(),  // 'dev' | 'direct' | 'production'
      },
    });
    return response.data;
  },
};

// Cache so the sidebar / signup screen don't refetch on every open.
let cachedRewards: ReferralRewards | null = null;
let rewardsPromise: Promise<ReferralRewards | null> | null = null;

/**
 * Fetches the backend-controlled referral XP rewards (joiner + referrer).
 * Falls back to null (callers phrase generically) if unavailable.
 */
export const getReferralRewards = (): Promise<ReferralRewards | null> => {
  if (cachedRewards) return Promise.resolve(cachedRewards);
  if (!rewardsPromise) {
    rewardsPromise = appConfigService
      .getAppConfig()
      .then((res) => {
        cachedRewards = res?.data?.rewards?.referral ?? null;
        return cachedRewards;
      })
      .catch((err) => {
        warn('Failed to fetch referral rewards', err);
        return null;
      })
      .finally(() => {
        rewardsPromise = null;
      });
  }
  return rewardsPromise;
};
