// ─── app-updater/updater.ts ──────────────────────────────────────────────────
// Core APK self-updater: check → download → install.
//
// Android only. The feature is compiled-in but inert unless the build was made
// with `APP_UPDATER_ENABLED=1` (see app.config.js) — store builds never run it
// and never get the REQUEST_INSTALL_PACKAGES permission.
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Application from 'expo-application';
import { File, Paths } from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import type { AppUpdate, UpdaterConfig } from './types';

const APK_FILE_NAME = 'taddlebox-update.apk';

/** Minimal file info the rest of the updater needs after a download. */
export type DownloadedApk = {
  uri: string;
  contentUri: string;
  size: number;
};

// android.content.Intent flags for handing a content:// URI to the installer:
//   FLAG_ACTIVITY_NEW_TASK (0x10000000) | FLAG_GRANT_READ_URI_PERMISSION (0x1)
const INSTALL_FLAGS = 0x10000000 | 0x00000001;

const MANIFEST_TIMEOUT_MS = 10_000;

/** Reads build-time config from Constants.expoConfig.extra.appUpdater. */
export function getUpdaterConfig(): UpdaterConfig {
  const extra = Constants.expoConfig?.extra as
    | { appUpdater?: Partial<UpdaterConfig> }
    | undefined;
  return {
    enabled:
      Boolean(extra?.appUpdater?.enabled) && Platform.OS === 'android' && !__DEV__,
    manifestUrl: extra?.appUpdater?.manifestUrl || '',
  };
}

export function isUpdaterEnabled(): boolean {
  return getUpdaterConfig().enabled;
}

/** Installed Android versionCode (from the APK's build.gradle / versionCode). */
export function getInstalledVersionCode(): number {
  const raw = Application.nativeBuildVersion;
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Fetches the update manifest. Returns null when disabled, unreachable,
 * malformed, or there is simply no entry (null android in the manifest).
 */
export async function fetchUpdateManifest(): Promise<AppUpdate | null> {
  const { enabled, manifestUrl } = getUpdaterConfig();
  if (!enabled || !manifestUrl) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MANIFEST_TIMEOUT_MS);
  try {
    const res = await fetch(manifestUrl, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const body = await res.json();

    // Tolerate { data: { android: {...} } }, { android: {...} }, or the
    // update object served directly (e.g. a static JSON file).
    const m = body?.data?.android ?? body?.android ?? body?.data ?? body;
    if (!m || typeof m.versionCode !== 'number' || !m.url) return null;

    return {
      versionCode: m.versionCode,
      versionName: m.versionName,
      url: m.url,
      size: m.size,
      changelog: m.changelog,
      mandatory: Boolean(m.mandatory),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function hasUpdate(update: AppUpdate): boolean {
  if (process.env.EXPO_PUBLIC_APP_TRACK === 'development') {
    // In dev builds, versionCode doesn't auto-increment, so we check if the
    // versionName (which now has a timestamp) has changed.
    return (
      update.versionCode > getInstalledVersionCode() ||
      update.versionName !== Application.nativeApplicationVersion
    );
  }
  return update.versionCode > getInstalledVersionCode();
}

/**
 * Downloads the APK into the app cache dir. Reports download progress as a
 * 0..1 fraction (only meaningful when the manifest carries `size`).
 */
export async function downloadApk(
  update: AppUpdate,
  onProgress?: (fraction: number) => void
): Promise<DownloadedApk> {
  const target = new File(Paths.cache, APK_FILE_NAME);
  if (target.exists) target.delete();

  const expected = update.size && update.size > 0 ? update.size : 0;
  const progressTimer = setInterval(() => {
    if (expected > 0) {
      onProgress?.(Math.min((target.size || 0) / expected, 1));
    }
  }, 200);

  try {
    // Android streams the response straight into the target file, so size
    // polling above reflects real progress.
    const file = await File.downloadFileAsync(update.url, target, {
      idempotent: true,
    });
    onProgress?.(1);
    return { uri: file.uri, contentUri: file.contentUri, size: file.size };
  } finally {
    clearInterval(progressTimer);
  }
}

/**
 * Hands the downloaded APK to the Android package installer (content:// URI via
 * expo-file-system's FileProvider, so no FileUriExposedException).
 */
export async function installApk(file: DownloadedApk): Promise<void> {
  await IntentLauncher.startActivityAsync(
    'android.intent.action.INSTALL_PACKAGE',
    {
      data: file.contentUri,
      flags: INSTALL_FLAGS,
    }
  );
}
