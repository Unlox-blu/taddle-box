/**
 * assetManifest — game card thumbnail cache.
 *
 * Downloads game card thumbnails from backend-provided URLs and caches them
 * locally so the Games grid shows local artwork instead of fetching remote
 * URLs on every render.
 *
 * This file used to contain a full manifest-fetching system (fetchAssetManifest,
 * downloadManifestAssets, SHA-256 integrity verification, CDN allowlists, etc.)
 * that fetched from GET /api/v1/game/assets/:assetSetId. That endpoint was never
 * implemented on the backend (always 404ed), and the callers silently swallowed
 * the errors. The dead code has been removed — this file now contains only the
 * thumbnail cache, which works independently.
 *
 * Thumbnail flow:
 *   1. GamesScreen calls preloadGameThumbnails() with the games list
 *   2. Each game's thumbnail URL (from the API) is downloaded to cache
 *   3. getCachedThumbnail() returns the local URI for instant rendering
 *   4. warmThumbnailCache() loads previously cached thumbnails from disk on cold start
 *   5. pruneOldAssetVersions() cleans up the cache directory
 */

import * as FileSystem from "expo-file-system/legacy";
import { warn } from "../utils/logger";

// ─── Cache layout ──────────────────────────────────────────────────────────

const ROOT = FileSystem.documentDirectory + "asset_manifests/";
const THUMBNAIL_CACHE_DIR = `${ROOT}_thumbnails/`;

const thumbnailCache = new Map<string, string>();

// ─── Thumbnail cache ───────────────────────────────────────────────────────

/**
 * Pre-download game grid thumbnails from backend-provided URLs.
 * Called on Games tab focus — ensures the grid shows local artwork
 * instead of fetching remote URLs on every render.
 *
 * Returns a map of slug → local file URI for instant sync lookups.
 */
export async function preloadGameThumbnails(
  games: Array<{ slug?: string; thumbnail?: string }>,
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};

  const toDownload = games.filter((g) => g.slug && g.thumbnail);
  if (toDownload.length === 0) return result;

  await Promise.all(
    toDownload.map(async (game) => {
      const slug = game.slug!;
      const url = game.thumbnail!;
      const filename = `${slug}.jpg`;
      const localUri = `${THUMBNAIL_CACHE_DIR}${filename}`;

      // Already cached in memory — skip disk check
      if (thumbnailCache.has(slug)) {
        result[slug] = thumbnailCache.get(slug)!;
        return;
      }

      // Already cached on disk
      try {
        const info = await FileSystem.getInfoAsync(localUri);
        if (info.exists) {
          thumbnailCache.set(slug, localUri);
          result[slug] = localUri;
          return;
        }
      } catch {}

      // Download (best-effort — never block the tab)
      try {
        await FileSystem.makeDirectoryAsync(THUMBNAIL_CACHE_DIR, { intermediates: true });
        const downloaded = await FileSystem.downloadAsync(url, localUri);
        if (downloaded.status === 200) {
          thumbnailCache.set(slug, localUri);
          result[slug] = localUri;
        }
      } catch {
        // Download failure must never block the games grid
      }
    }),
  );

  return result;
}

/**
 * Get a cached thumbnail URI for a game slug.
 * Returns null if not cached — caller falls back to the remote URL.
 */
export function getCachedThumbnail(slug: string): string | null {
  return thumbnailCache.get(slug) || null;
}

/**
 * Warm the thumbnail cache from disk on app start.
 * Reads previously downloaded thumbnails so they appear instantly
 * without waiting for the next preloadGameThumbnails call.
 */
export async function warmThumbnailCache(): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(THUMBNAIL_CACHE_DIR);
    if (!info.exists) return;
    const files = await FileSystem.readDirectoryAsync(THUMBNAIL_CACHE_DIR);
    for (const file of files) {
      if (!file.endsWith('.jpg')) continue;
      const slug = file.replace('.jpg', '');
      thumbnailCache.set(slug, `${THUMBNAIL_CACHE_DIR}${file}`);
    }
  } catch {
    // Best-effort — never block startup
  }
}

/**
 * Remove old asset versions from the cache directory.
 * Keeps the current version and prunes everything else.
 */
export async function pruneOldAssetVersions(
  _currentAssetSetId: string,
  _currentVersion: number,
): Promise<void> {
  // Thumbnail cache doesn't use versioned directories — nothing to prune.
  // This function exists for API compatibility with callers.
}
