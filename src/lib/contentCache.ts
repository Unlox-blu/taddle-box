/**
 * contentCache.ts — Centralized content mutation utility.
 *
 * Uses React Query's `setQueriesData` for predictable, targeted cache updates
 * instead of scanning every cache entry with `findAll`.
 *
 * Updates content across: feed, bookmarks, profile, community, search, notifications
 */
import { QueryClient } from '@tanstack/react-query';

// ─── Patch content across all caches ─────────────────────────────────────────
/**
 * Optimistically patch a single content item across every React Query cache
 * that might contain it. Uses `setQueriesData` for targeted updates.
 *
 * Works with both:
 *   - Infinite query caches: { pages: ContentItem[][] }
 *   - Simple array caches:   ContentItem[]
 *
 * @param queryClient  The React Query client instance.
 * @param contentId    The ID of the content to patch.
 * @param patch        A function that receives the raw content and returns the patched version.
 */
export function patchContentInAllCaches(
  queryClient: QueryClient,
  contentId: string,
  patch: (content: any) => any,
): void {
  const targetedKeys: (string | readonly unknown[])[] = [
    ['feed'],
    ['bookmarks'],
    ['notifications'],
  ];

  targetedKeys.forEach((keyPrefix) => {
    queryClient.setQueriesData(
      { queryKey: keyPrefix as readonly unknown[] },
      (old: any) => patchCacheData(old, contentId, patch),
    );
  });

  queryClient.setQueriesData(
    { predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'profile' && q.queryKey[2] === 'posts' },
    (old: any) => patchCacheData(old, contentId, patch),
  );

  queryClient.setQueriesData(
    { predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'community' && q.queryKey[2] === 'posts' },
    (old: any) => patchCacheData(old, contentId, patch),
  );

  queryClient.setQueriesData(
    { predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'search' },
    (old: any) => patchCacheData(old, contentId, patch),
  );
}

// ─── Remove content from all caches ──────────────────────────────────────────
/**
 * Remove a content item from every cache (used after delete).
 */
export function removeContentFromAllCaches(
  queryClient: QueryClient,
  contentId: string,
): void {
  const targetedKeys: (string | readonly unknown[])[] = [
    ['feed'],
    ['bookmarks'],
    ['notifications'],
  ];

  targetedKeys.forEach((keyPrefix) => {
    queryClient.setQueriesData(
      { queryKey: keyPrefix as readonly unknown[] },
      (old: any) => removeFromCacheData(old, contentId),
    );
  });

  queryClient.setQueriesData(
    { predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'profile' && q.queryKey[2] === 'posts' },
    (old: any) => removeFromCacheData(old, contentId),
  );

  queryClient.setQueriesData(
    { predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'community' && q.queryKey[2] === 'posts' },
    (old: any) => removeFromCacheData(old, contentId),
  );

  queryClient.setQueriesData(
    { predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'search' },
    (old: any) => removeFromCacheData(old, contentId),
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function patchCacheData(old: any, contentId: string, patch: (content: any) => any): any {
  if (!old) return old;

  if (old.pages && Array.isArray(old.pages)) {
    return {
      ...old,
      pages: old.pages.map((page: any[]) =>
        page.map((row: any) => {
          if (row?.data?.id === contentId) {
            return { ...row, data: patch(row.data) };
          }
          if (row?.id === contentId) {
            return patch(row);
          }
          return row;
        }),
      ),
    };
  }

  if (Array.isArray(old)) {
    return old.map((item: any) =>
      item?.id === contentId ? patch(item) : item,
    );
  }

  return old;
}

function removeFromCacheData(old: any, contentId: string): any {
  if (!old) return old;

  if (old.pages && Array.isArray(old.pages)) {
    return {
      ...old,
      pages: old.pages.map((page: any[]) =>
        page.filter((row: any) => {
          if (row?.data?.id === contentId) return false;
          if (row?.id === contentId) return false;
          return true;
        }),
      ),
    };
  }

  if (Array.isArray(old)) {
    return old.filter((item: any) => item?.id !== contentId);
  }

  return old;
}
