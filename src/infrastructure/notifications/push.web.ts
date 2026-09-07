/**
 * push.web.ts — web twin for the push-notifications abstraction.
 *
 * expo-notifications / expo-push-token registration is a native-only concern
 * (web push requires a service worker + VAPID, which the backend doesn't use).
 * This twin keeps the same surface as push.native.ts so feature code imports
 * `@/infrastructure/notifications/push` without knowing about Platform.OS;
 * Metro picks the platform twin via extension resolution.
 *
 * Every operation is a safe no-op returning the native "unavailable" shape:
 * registration returns null and getNotificationsModule() returns null, which
 * makes NotificationProvider skip its native-listener wiring on web.
 */

let activeUserIdForPush: string | null = null;

export function setActiveUserIdForPush(userId: string | null) {
  activeUserIdForPush = userId;
}

export const isExpoGo = false;
export const isSupportedNativeNotifications = false;

export async function getNotificationsModule(): Promise<null> {
  return null;
}

/** No-op on web — there is no native token to rotate. */
export async function rotateSessionId(): Promise<string> {
  return "";
}

/** Web push registration is not supported; always returns null (no token). */
export async function registerForPushNotificationsAsync(): Promise<null> {
  return null;
}

export async function startTokenRefreshListener() {
  // no-op
}

export function stopTokenRefreshListener() {
  // no-op
}

/** No app-icon badge exists on web. */
export async function clearPushBadge() {
  // no-op
}
