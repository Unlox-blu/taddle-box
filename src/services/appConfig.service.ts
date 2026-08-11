import { apiClient } from './apiClient';

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

export const appConfigService = {
  getAppConfig: async (): Promise<{ data: AppConfig }> => {
    const response = await apiClient.get('/app-config');
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
        console.warn('Failed to fetch referral rewards', err);
        return null;
      })
      .finally(() => {
        rewardsPromise = null;
      });
  }
  return rewardsPromise;
};
