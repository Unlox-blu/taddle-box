import { apiClient } from '../api/api-client';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { warn } from '../logging/logger';

export interface ReferralRewards {
  joinerXp: number;
  referrerXp: number;
}

export interface PostTierRewards {
  singleType: number;
  twoTypes: number;
  threeTypes: number;
}

export interface AppConfig {
  latestVersion: string;
  minimumVersion: string;
  storeUrl: string;
  /** Backend-controlled XP rewards (refer & earn, …) — never hardcode amounts. */
  rewards?: {
    referral: ReferralRewards;
    postCreate?: PostTierRewards;
    postView?: PostTierRewards;
    /** Task-board milestone bonus (every 5th post/share, profile checkpoints). */
    taskBonus?: number;
  };
  /** Economy conversion rate (XP per ₹1) — mirrors the server's XP_PER_RUPEE. */
  xpRate?: {
    xpPerRupee: number;
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

// Cached post-creation tier rewards (display only — the server enforces the
// actual credit).
let cachedPostTiers: PostTierRewards | null = null;
let postTiersPromise: Promise<PostTierRewards | null> | null = null;

/**
 * Fetches the backend-controlled post-creation XP tiers. Falls back to null
 * (callers phrase generically instead of hardcoding numbers) if unavailable.
 */
export const getPostCreateRewards = (): Promise<PostTierRewards | null> => {
  if (cachedPostTiers) return Promise.resolve(cachedPostTiers);
  if (!postTiersPromise) {
    postTiersPromise = appConfigService
      .getAppConfig()
      .then((res) => {
        cachedPostTiers = res?.data?.rewards?.postCreate ?? null;
        return cachedPostTiers;
      })
      .catch((err) => {
        warn('Failed to fetch post XP rewards', err);
        return null;
      })
      .finally(() => {
        postTiersPromise = null;
      });
  }
  return postTiersPromise;
};

// Cached XP↔cash conversion rate (display only — conversions are executed
// and enforced server-side).
let cachedXpRate: number | null = null;
let xpRatePromise: Promise<number | null> | null = null;

/**
 * Fetches the backend XP↔cash rate (XP per ₹1). Falls back to null
 * (callers phrase generically) if unavailable.
 */
export const getXpRate = (): Promise<number | null> => {
  if (cachedXpRate) return Promise.resolve(cachedXpRate);
  if (!xpRatePromise) {
    xpRatePromise = appConfigService
      .getAppConfig()
      .then((res) => {
        cachedXpRate = res?.data?.xpRate?.xpPerRupee ?? null;
        return cachedXpRate;
      })
      .catch((err) => {
        warn('Failed to fetch XP rate', err);
        return null;
      })
      .finally(() => {
        xpRatePromise = null;
      });
  }
  return xpRatePromise;
};

/**
 * Resolves the creation reward tier (single/two/three content types) from the
 * backend-provided tiers. Returns null when the config is unavailable —
 * callers must phrase generically instead of hardcoding a number.
 */
// Cached task-board milestone bonus (display only — the server credits it).
let cachedTaskBonus: number | null = null;
let taskBonusPromise: Promise<number | null> | null = null;

/**
 * Fetches the backend task-board milestone XP bonus. Falls back to null
 * (callers phrase generically instead of hardcoding a number) if unavailable.
 */
export const getTaskBonus = (): Promise<number | null> => {
  if (cachedTaskBonus != null) return Promise.resolve(cachedTaskBonus);
  if (!taskBonusPromise) {
    taskBonusPromise = appConfigService
      .getAppConfig()
      .then((res) => {
        cachedTaskBonus = res?.data?.rewards?.taskBonus ?? null;
        return cachedTaskBonus;
      })
      .catch((err) => {
        warn('Failed to fetch task bonus XP', err);
        return null;
      })
      .finally(() => {
        taskBonusPromise = null;
      });
  }
  return taskBonusPromise;
};

export const postCreateRewardFor = async (
  draft: { content?: string; media?: any[] },
): Promise<number | null> => {
  const tiers = await getPostCreateRewards();
  if (!tiers) return null;
  const hasText = !!(draft.content && String(draft.content).trim().length > 0);
  const items = Array.isArray(draft.media) ? draft.media : [];
  const hasVisual = items.some(
    (m: any) => m && m.mimeType !== "audio" && m.type !== "audio",
  );
  const hasAudio = items.some(
    (m: any) => m && (m.mimeType === "audio" || m.type === "audio"),
  );
  const count = (hasText ? 1 : 0) + (hasVisual ? 1 : 0) + (hasAudio ? 1 : 0);
  if (count >= 3) return tiers.threeTypes;
  if (count === 2) return tiers.twoTypes;
  return tiers.singleType;
};
