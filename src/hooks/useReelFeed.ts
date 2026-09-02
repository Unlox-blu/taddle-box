/**
 * useReelFeed — Paginated reel feed with real cursor-based pagination.
 *
 * Architecture:
 *   1. Seed from caller's existing posts (e.g. from Home Feed cache)
 *   2. Cursor-based pagination for continuation (createdAt + id)
 *   3. Separate newer-posts check for "X new reels" badge
 *   4. Deduplication by post ID
 *   5. Local patchPost for optimistic updates
 *
 * Cursor encoding: base64-encoded JSON { createdAt: "ISO", id: "uuid" }
 * (matching backend pagination.util.js)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { postsService } from '../services/posts.service';
import { bookmarkService } from '../services/bookmark.service';
import { communityService } from '../services/community.service';
import type { Post } from '../types';

export type ReelFeedContext =
  | 'home'
  | 'profile'
  | 'bookmarks'
  | 'community'
  | 'search';

interface UseReelFeedOptions {
  /** Posts pre-seeded by the caller (e.g. from an existing feed list). */
  initialPosts: Post[];
  /** The post the user tapped — determines `startIndex`. */
  startPostId: string;
  feedContext?: ReelFeedContext;
  /** userId for 'profile', communitySlug for 'community'. */
  feedContextId?: string;
  /** Whether the screen is focused. When false, newer-posts polling is paused. */
  isFocused?: boolean;
}

interface UseReelFeedReturn {
  posts: Post[];
  startIndex: number;
  loadMore: () => void;
  hasMore: boolean;
  isLoading: boolean;
  /** Patch a single post in the list (for optimistic like/save/repost). */
  patchPost: (postId: string, patch: (p: Post) => Post) => void;
  /** Number of newer posts available (for "X new reels" badge). */
  newerCount: number;
  /** Refresh to load newer posts. Returns the merged posts array after prepend. */
  refreshNewer: () => Promise<Post[]>;
  /** Manually clear the newerCount badge (e.g. when user scrolls past newer posts). */
  clearNewerCount: () => void;
}

const PAGE_SIZE = 20;
/** Only show the "new reels" badge if the user hasn't refreshed in 30 minutes. */
const BADGE_THRESHOLD_MS = 30 * 60 * 1000;

export function useReelFeed({
  initialPosts,
  startPostId,
  feedContext = 'home',
  feedContextId,
  isFocused = true,
}: UseReelFeedOptions): UseReelFeedReturn {
  const queryClient = useQueryClient();

  // ── Seed: deduplicate initialPosts ──
  const [posts, setPosts] = useState<Post[]>(() => {
    return deduplicatePosts(initialPosts);
  });

  // Cursor for next page (opaque base64 string, null when exhausted)
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [newerCount, setNewerCount] = useState(0);
  const isFetchingRef = useRef(false);
  const mountedRef = useRef(true);
  /** Timestamp of the last successful refreshNewer() call. */
  const lastRefreshTimeRef = useRef(Date.now());
  /** Set by refreshNewer to prevent the polling effect from immediately
   *  re-fetching the count (which would overwrite setNewerCount(0)). */
  const skipNextPollRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Compute stable start index from startPostId.
  const startIndex = useMemo(() => {
    const idx = posts.findIndex((p) => p.id === startPostId);
    return Math.max(0, idx);
  }, [posts, startPostId]);

  // ── Compute newestCursor from the most recently published post ──
  // The feed is sorted by algorithm score, NOT by date, so posts[0] may be
  // an old high-scoring post.  We scan for the truly newest post so the
  // "X new reels" count reflects actual unseen posts.
  const newestCursor = useMemo(() => {
    if (posts.length === 0) return null;
    let newestPost = posts[0];
    for (let i = 1; i < posts.length; i++) {
      const p = posts[i];
      const pDate = (p as any).publishedAt || (p as any).createdAt || (p as any).created_at;
      const bestDate = (newestPost as any).publishedAt || (newestPost as any).createdAt || (newestPost as any).created_at;
      if (pDate && (!bestDate || new Date(pDate).getTime() > new Date(bestDate).getTime())) {
        newestPost = p;
      }
    }
    const createdAt = (newestPost as any).createdAt || (newestPost as any).created_at || (newestPost as any).publishedAt;
    if (createdAt && newestPost.id) {
      return btoa(JSON.stringify({ createdAt, id: newestPost.id }));
    }
    return null;
  }, [posts]);

  // ── Merge with existing React Query cache on mount ──
  useEffect(() => {
    if (initialPosts.length >= 5) return;

    const cachedPosts = readFromQueryCache(queryClient, feedContext, feedContextId);
    if (cachedPosts.length > 0) {
      setPosts((prev) => {
        const merged = [...prev, ...cachedPosts];
        return deduplicatePosts(merged);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Fetch a page using real cursor-based pagination ──
  const fetchPage = useCallback(
    async (cursor: string | null, replace = false) => {
      if (isFetchingRef.current) return;
      isFetchingRef.current = true;
      setIsLoading(true);
      try {
        let fetched: Post[] = [];
        let pagination: { nextCursor?: string | null; hasNext?: boolean } = {};

        switch (feedContext) {
          case 'profile':
            if (feedContextId) {
              const res = await postsService.getUserPostsCursor(feedContextId, PAGE_SIZE, cursor);
              fetched = res.data || [];
              pagination = res.pagination || {};
            }
            break;
          case 'bookmarks': {
            const res = await bookmarkService.getBookmarksCursor(PAGE_SIZE, cursor);
            fetched = res.data || [];
            pagination = res.pagination || {};
            break;
          }
          case 'community':
            if (feedContextId) {
              const res = await communityService.getCommunityPostsCursor(feedContextId, PAGE_SIZE, cursor);
              fetched = res.data || [];
              pagination = res.pagination || {};
            }
            break;
          default: {
            const res = await postsService.getFeedCursor(PAGE_SIZE, cursor);
            fetched = res.data || [];
            pagination = res.pagination || {};
            break;
          }
        }

        if (!mountedRef.current) return;

        if (fetched.length < PAGE_SIZE || !pagination.nextCursor) {
          setHasMore(false);
        }

        setNextCursor(pagination.nextCursor || null);

        setPosts((prev) => {
          if (replace) return deduplicatePosts(fetched);
          return deduplicatePosts([...prev, ...fetched]);
        });
      } catch {
        // Silently ignore — the user still sees whatever posts we have.
      } finally {
        if (mountedRef.current) {
          setIsLoading(false);
        }
        isFetchingRef.current = false;
      }
    },
    [feedContext, feedContextId],
  );

  const loadMore = useCallback(() => {
    if (!hasMore || isFetchingRef.current) return;
    fetchPage(nextCursor);
  }, [fetchPage, hasMore, nextCursor]);

  // ── Check for newer posts (paused when screen is unfocused) ──
  // Only shows the badge if 30+ minutes have passed since the last refresh,
  // so the user isn't bombarded with the pill every few seconds.
  useEffect(() => {
    if (!newestCursor || feedContext !== 'home' || !isFocused) return;

    const checkForNewer = async () => {
      try {
        // Respect the 30-minute threshold
        if (Date.now() - lastRefreshTimeRef.current < BADGE_THRESHOLD_MS) return;
        const { count } = await postsService.getNewerCount(newestCursor);
        if (mountedRef.current && count > 0) {
          setNewerCount(count);
        }
      } catch {
        // Silently ignore
      }
    };

    // After a refreshNewer() call, skip the immediate check so the
    // setNewerCount(0) inside refreshNewer isn't instantly overwritten.
    if (skipNextPollRef.current) {
      skipNextPollRef.current = false;
    } else {
      checkForNewer();
    }
    const interval = setInterval(checkForNewer, 30000);
    return () => clearInterval(interval);
  }, [newestCursor, feedContext, isFocused]);

  // ── Refresh to load newer posts ──
  // Does a FULL feed refresh (replaces the list, resets pagination) so that
  // loadMore() seamlessly continues with older posts afterward.
  const refreshNewer = useCallback(async (): Promise<Post[]> => {
    if (feedContext !== 'home') return [];
    try {
      const res = await postsService.getFeedCursor(PAGE_SIZE, null);
      if (!mountedRef.current) return [];
      const fetched = res.data || [];
      if (fetched.length > 0) {
        // Tell the polling effect to skip its immediate check so that
        // setNewerCount(0) below isn't overwritten on the next render.
        skipNextPollRef.current = true;
        lastRefreshTimeRef.current = Date.now();
        setPosts(fetched);
        setNextCursor(res.pagination?.nextCursor || null);
        setHasMore(!!res.pagination?.hasNext);
        setNewerCount(0);
        return fetched;
      }
      return [];
    } catch {
      return [];
    }
  }, [feedContext]);

  const patchPost = useCallback((postId: string, patch: (p: Post) => Post) => {
    setPosts((prev) => prev.map((p) => (p.id === postId ? patch(p) : p)));
  }, []);

  const clearNewerCount = useCallback(() => {
    setNewerCount(0);
  }, []);

  return { posts, startIndex, loadMore, hasMore, isLoading, patchPost, newerCount, refreshNewer, clearNewerCount };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Deduplicate posts by ID, preserving order (first occurrence wins). */
function deduplicatePosts(posts: Post[]): Post[] {
  const seen = new Set<string>();
  return posts.filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
}

/**
 * Read existing posts from the relevant React Query cache.
 */
function readFromQueryCache(
  queryClient: any,
  feedContext: ReelFeedContext,
  feedContextId?: string,
): Post[] {
  try {
    let queryKey: readonly unknown[] | undefined;

    switch (feedContext) {
      case 'home':
        queryKey = ['feed'];
        break;
      case 'bookmarks':
        queryKey = ['bookmarks'];
        break;
      case 'profile':
        queryKey = ['profile', feedContextId || '', 'posts'];
        break;
      case 'community':
        queryKey = ['community', feedContextId || '', 'posts'];
        break;
      default:
        return [];
    }

    if (!queryKey) return [];

    const data = queryClient.getQueryData(queryKey);
    if (!data) return [];

    if (data.pages && Array.isArray(data.pages)) {
      const posts: Post[] = [];
      data.pages.forEach((page: any[]) => {
        if (!Array.isArray(page)) return;
        page.forEach((row: any) => {
          if (row?.data?.id) posts.push(row.data);
          if (row?.id && !row?.itemType) posts.push(row);
        });
      });
      return posts;
    }

    if (Array.isArray(data)) {
      return data.filter((item: any) => item?.id);
    }

    return [];
  } catch {
    return [];
  }
}
