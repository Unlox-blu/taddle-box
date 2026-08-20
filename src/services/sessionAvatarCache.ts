/**
 * sessionAvatarCache.ts
 *
 * Session-only in-memory cache for user avatars used in game components.
 * Avatars are prefetched into memory on first access and served from cache
 * for the rest of the session. The cache is cleared on logout or app restart
 * — nothing persists to disk.
 *
 * This avoids re-fetching the same avatar URLs across multiple game screens
 * within a single session (e.g. TapRush, MemoryGrid, Chess, leaderboard).
 */
import { Image } from "react-native";

// Module-level cache — lives for the duration of the JS process.
// Cleared on logout (call clearSessionAvatars) or app restart.
const cache = new Map<string, string>();

/**
 * Returns a cached avatar URI for the given URL.
 * If the URL is not yet cached, triggers a background prefetch
 * (Image.prefetch) so the image is ready on next render.
 * Returns the original URL either way — React Native Image handles
 * the actual display.
 */
export function getSessionAvatar(uri: string | null | undefined): string | undefined {
  if (!uri) return undefined;

  // Already cached — return the local copy
  if (cache.has(uri)) return cache.get(uri);

  // Not cached yet — prefetch in background so next render is instant
  // Don't await: the Image component will show a loading state briefly,
  // then the cached version kicks in on re-render.
  Image.prefetch(uri)
    .then(() => {
      cache.set(uri, uri);
    })
    .catch(() => {
      /* prefetch failure is non-fatal — Image will load from network */
    });

  // Return the URL directly — Image handles loading states natively
  return uri;
}

/**
 * Clears the session avatar cache. Call on logout to free memory
 * and ensure stale avatars from a previous account don't leak.
 */
export function clearSessionAvatars(): void {
  cache.clear();
}
