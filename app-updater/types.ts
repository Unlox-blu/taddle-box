// ─── app-updater/types.ts ────────────────────────────────────────────────────
// Shared types for the APK self-updater.

/**
 * Shape of one update entry. The server manifest can wrap this in
 * `{ android: {...} }` and/or `{ data: {...} }` — the fetcher tolerates all.
 */
export type AppUpdate = {
  /** Android versionCode of the latest APK (integer, must exceed the installed one). */
  versionCode: number;
  /** Human-readable version, e.g. "1.0.2". */
  versionName?: string;
  /** Direct https:// URL to the APK file. */
  url: string;
  /** APK size in bytes (optional — used for download progress %). */
  size?: number;
  /** Release notes shown in the update prompt. */
  changelog?: string;
  /** true → update is required, the prompt cannot be dismissed. */
  mandatory?: boolean;
};

/** Build-time config injected via app.config.js → Constants.expoConfig.extra. */
export type UpdaterConfig = {
  enabled: boolean;
  manifestUrl: string;
};
