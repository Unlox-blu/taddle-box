/**
 * Production-safe logger.
 *
 * In development (__DEV__ === true), all log/warn/error calls pass through to
 * the real console so debugging is unaffected.
 *
 * In production builds, everything is silenced — no auth state, token IDs,
 * socket session IDs, or error stacks leak to Sentry/Bugsnag/Logcat.
 *
 * Usage:
 *   import { log, warn, error } from '../utils/logger';
 *   log('[Auth] Token refreshed');
 *   warn('[apiClient] Missing tokenExpiresAt');
 *   error('Upload failed', e);
 */

export function log(...args: any[]): void {
  if (__DEV__) console.log(...args);
}

export function warn(...args: any[]): void {
  if (__DEV__) console.warn(...args);
}

export function error(...args: any[]): void {
  if (__DEV__) console.error(...args);
}

export function info(...args: any[]): void {
  if (__DEV__) console.info(...args);
}
