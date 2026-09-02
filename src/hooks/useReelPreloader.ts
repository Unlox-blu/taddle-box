/**
 * useReelPreloader — Prefetches video/image assets for upcoming reels.
 *
 * When the user is viewing reel N, this hook preloads the video URLs for
 * reels N+1 and N+2 so swiping is instant (no loading spinner).
 *
 * Uses expo-av's Video.prefetchAsync for video assets and expo-image's
 * Image.prefetch for image assets. Falls back to a simple fetch for
 * browsers/ environments that don't support these APIs.
 */
import { useEffect, useRef, useCallback } from 'react';
import { Image } from 'expo-image';
import type { Post } from '../types';

interface UseReelPreloaderOptions {
  /** The full ordered list of reel posts. */
  posts: Post[];
  /** The index of the currently active reel. */
  activeIndex: number;
  /** Number of reels to preload ahead (default: 2). */
  preloadCount?: number;
}

/** Extract the primary media URL from a post (first video, or first image). */
function getMediaUrl(post: any): string | null {
  const media = post?.media || [];
  // Prefer video, then image
  const video = media.find(
    (m: any) => m.media_type === 'video' || m.type === 'video',
  );
  if (video?.media_url) return video.media_url;

  const image = media.find(
    (m: any) => m.media_type !== 'audio' && m.type !== 'audio',
  );
  if (image?.media_url) return image.media_url;

  // Fallback: mediaUri or image field
  if (post?.mediaUri) return post.mediaUri;
  if (post?.image) return post.image;

  return null;
}

/** Check if a URL is a video asset. */
function isVideoUrl(url: string): boolean {
  return /\.(mp4|mov|webm|m3u8|avi)(\?|$)/i.test(url);
}

/** Prefetch a single asset — no-op on error (best-effort). */
async function prefetchAsset(url: string): Promise<void> {
  try {
    if (isVideoUrl(url)) {
      // For video, we can't easily prefetch with expo-av in all cases.
      // Use a background fetch to warm the HTTP cache.
      await fetch(url, { method: 'HEAD' }).catch(() => {});
    } else {
      // For images, use expo-image's prefetch (cached natively).
      await Image.prefetch(url).catch(() => {});
    }
  } catch {
    // Best-effort — ignore errors
  }
}

/**
 * Extract all media URLs from a post (for multi-image carousels).
 */
function getAllMediaUrls(post: any): string[] {
  const media = post?.media || [];
  return media
    .filter((m: any) => m.media_type !== 'audio' && m.type !== 'audio')
    .map((m: any) => m.media_url)
    .filter(Boolean);
}

export function useReelPreloader({
  posts,
  activeIndex,
  preloadCount = 2,
}: UseReelPreloaderOptions) {
  const prefetchedRef = useRef(new Set<string>());

  // Reset prefetch cache when posts change significantly (new page loaded)
  useEffect(() => {
    // Keep only URLs still in the current post list
    const currentUrls = new Set<string>();
    posts.forEach((post) => {
      getAllMediaUrls(post).forEach((url) => currentUrls.add(url));
    });
    // Clear entries that are no longer relevant
    prefetchedRef.current.forEach((url) => {
      if (!currentUrls.has(url)) {
        prefetchedRef.current.delete(url);
      }
    });
  }, [posts.length]);

  // Prefetch next N reels when activeIndex changes
  useEffect(() => {
    const urlsToPrefetch: string[] = [];

    for (let i = 1; i <= preloadCount; i++) {
      const targetIndex = activeIndex + i;
      if (targetIndex >= posts.length) break;

      const targetPost = posts[targetIndex];
      const urls = getAllMediaUrls(targetPost);

      // Only prefetch the first media item per reel (most important)
      const primaryUrl = urls[0];
      if (primaryUrl && !prefetchedRef.current.has(primaryUrl)) {
        urlsToPrefetch.push(primaryUrl);
      }
    }

    // Fire-and-forget prefetches
    urlsToPrefetch.forEach((url) => {
      prefetchedRef.current.add(url);
      prefetchAsset(url);
    });
  }, [activeIndex, posts, preloadCount]);

  /** Force-prefetch a specific post's assets (e.g., on manual trigger). */
  const prefetchPost = useCallback(
    (post: Post) => {
      const urls = getAllMediaUrls(post);
      urls.forEach((url) => {
        if (!prefetchedRef.current.has(url)) {
          prefetchedRef.current.add(url);
          prefetchAsset(url);
        }
      });
    },
    [],
  );

  return { prefetchPost };
}
