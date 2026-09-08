/**
 * store-review.ts
 *
 * Triggers the native in-app rating dialog (SKStoreReviewController on iOS,
 * ReviewManager on Android) once per user after they've used the app long
 * enough to have a meaningful opinion.
 *
 * Eligibility criteria (all must pass):
 *   - At least MIN_DAYS_SINCE_INSTALL days since first launch
 *   - At least MIN_SESSIONS session opens
 *   - Not already prompted (PROMPTED_KEY set in AsyncStorage)
 *   - Not in dev or direct build (no point prompting internal testers)
 *
 * The OS also enforces its own throttle (iOS: max 3 per year).
 * We never force the dialog — if isAvailableAsync() returns false we skip.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as StoreReview from 'expo-store-review';
import { warn } from '../logging/logger';

const FIRST_LAUNCH_KEY = '@review/firstLaunchDate';
const SESSION_COUNT_KEY = '@review/sessionCount';
const PROMPTED_KEY      = '@review/prompted';

const MIN_DAYS_SINCE_INSTALL = 7;   // user must have had the app for at least a week
const MIN_SESSIONS           = 5;   // and opened it at least 5 times

/** Call once per app session (e.g. in AuthProvider after login). */
export async function recordSession(): Promise<void> {
  try {
    // Record first launch date on the very first session.
    const firstLaunch = await AsyncStorage.getItem(FIRST_LAUNCH_KEY);
    if (!firstLaunch) {
      await AsyncStorage.setItem(FIRST_LAUNCH_KEY, String(Date.now()));
    }

    // Increment session count.
    const count = parseInt((await AsyncStorage.getItem(SESSION_COUNT_KEY)) || '0', 10);
    await AsyncStorage.setItem(SESSION_COUNT_KEY, String(count + 1));
  } catch (e) {
    warn('[StoreReview] recordSession failed:', e);
  }
}

/**
 * Check eligibility and show the native rating dialog if all criteria are met.
 * Safe to call from anywhere — no-ops silently if not eligible.
 */
export async function maybeRequestReview(): Promise<void> {
  // Skip in dev and direct builds — only meaningful for store users.
  if (__DEV__) return;

  try {
    // Already prompted — never ask twice.
    const prompted = await AsyncStorage.getItem(PROMPTED_KEY);
    if (prompted) return;

    // Check days since install.
    const firstLaunch = await AsyncStorage.getItem(FIRST_LAUNCH_KEY);
    if (!firstLaunch) return;
    const daysSince = (Date.now() - parseInt(firstLaunch, 10)) / (1000 * 60 * 60 * 24);
    if (daysSince < MIN_DAYS_SINCE_INSTALL) return;

    // Check session count.
    const count = parseInt((await AsyncStorage.getItem(SESSION_COUNT_KEY)) || '0', 10);
    if (count < MIN_SESSIONS) return;

    // Check if the native dialog is available on this device/OS version.
    const available = await StoreReview.isAvailableAsync();
    if (!available) return;

    // Mark as prompted BEFORE showing so a crash during the dialog
    // doesn't let it re-trigger on the next session.
    await AsyncStorage.setItem(PROMPTED_KEY, '1');

    await StoreReview.requestReview();
  } catch (e) {
    warn('[StoreReview] maybeRequestReview failed:', e);
  }
}
