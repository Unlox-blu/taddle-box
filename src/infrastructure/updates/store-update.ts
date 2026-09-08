/**
 * store-update.ts
 *
 * Safe wrapper around expo-in-app-updates.
 *
 * - In Expo Go / dev builds: the native module isn't compiled in, so
 *   requireNativeModule throws. All functions no-op silently.
 * - In direct APK builds: the custom APK self-updater handles updates;
 *   we skip the store check (APP_UPDATER_ENABLED=1 on those builds).
 * - In store builds (Play Store / App Store): fully active.
 *
 * Android: uses the native Play Core in-app update overlay.
 * iOS: opens the App Store page in a modal (Apple has no native in-app API).
 */

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { warn } from '../logging/logger';

// Lazy-load the native module so the import itself never throws.
// requireNativeModule throws synchronously if the native code isn't compiled
// in — catching it here makes the whole module safe for Expo Go.
let _checkForUpdate: (() => Promise<{ updateAvailable: boolean; immediateAllowed?: boolean }>) | null = null;
let _startUpdate: ((isImmediate?: boolean) => Promise<boolean>) | null = null;

try {
  const mod = require('expo-in-app-updates');
  _checkForUpdate = mod.checkForUpdate;
  _startUpdate = mod.startUpdate;
} catch {
  // Native module not available — Expo Go, simulator, or unsupported platform.
}

/**
 * Returns true when store in-app updates should be used.
 * Disabled in:
 *  - dev builds (__DEV__)
 *  - direct APK builds (APP_UPDATER_ENABLED=1 — they use the custom updater)
 *  - non-Android/iOS platforms
 */
export function isStoreUpdateEnabled(): boolean {
  if (__DEV__) return false;
  if (!_checkForUpdate || !_startUpdate) return false;
  // Direct APK builds have the custom updater — skip store check there.
  const extra = Constants.expoConfig?.extra as { appUpdater?: { enabled?: boolean } } | undefined;
  if (extra?.appUpdater?.enabled) return false;
  return Platform.OS === 'android' || Platform.OS === 'ios';
}

/**
 * Checks the Play Store / App Store for an update and triggers the native
 * update flow if one is available.
 *
 * - Android: shows the native Play Core overlay (flexible by default,
 *   immediate if the Play Store signals high priority).
 * - iOS: opens the App Store page in a modal.
 *
 * Safe to call unconditionally — no-ops when not applicable.
 */
export async function checkAndTriggerStoreUpdate(): Promise<void> {
  if (!isStoreUpdateEnabled()) return;
  try {
    const result = await _checkForUpdate!();
    if (!result.updateAvailable) return;
    // Use immediate update if Play Store signals it's allowed and priority
    // warrants it — otherwise use flexible (user can continue using the app).
    const useImmediate = Platform.OS === 'android' && !!result.immediateAllowed;
    await _startUpdate!(useImmediate);
  } catch (e) {
    // Non-fatal — the app continues normally if the update check fails.
    warn('[StoreUpdate] checkAndTriggerStoreUpdate failed:', e);
  }
}
