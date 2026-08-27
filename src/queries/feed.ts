import { useInfiniteQuery } from '@tanstack/react-query';
import { queryKeys } from '../lib/queryKeys';
import { postsService } from '../services/posts.service';
import { communityService } from '../services/community.service';
import { bookmarkService } from '../services/bookmark.service';
import type { FeedRow } from '../components/common/SharedFeed';

const PAGE_SIZE = 20;

// ─── Home Feed ────────────────────────────────────────────────────────────────
export function useFeed(hashtag?: string) {
  return useInfiniteQuery({
    queryKey: [...queryKeys.feed, hashtag],
    queryFn: async ({ pageParam = 1 }) => {
      const res = await postsService.getFeed(pageParam, PAGE_SIZE, hashtag);
      return Array.isArray(res) ? res : (res.data || []);
    },
    getNextPageParam: (lastPage, allPages) => {
      return lastPage.length === PAGE_SIZE ? allPages.length + 1 : undefined;
    },
    initialPageParam: 1,
  });
}

// ─── Bookmarks ────────────────────────────────────────────────────────────────
export function useBookmarks() {
  return useInfiniteQuery<FeedRow[]>({
    queryKey: queryKeys.bookmarks,
    queryFn: async ({ pageParam = 1 }) => {
      const res = await bookmarkService.getBookmarks(pageParam as number, PAGE_SIZE);
      return (res.results || []).map((item: any) => ({
        type: (item.type || item.itemType || item.item_type || 'unknown') as string,
        item,
      }));
    },
    getNextPageParam: (lastPage, allPages) => {
      // bookmarkService returns hasNext in the response, but we can infer
      // from page size since results are pre-merged + sorted server-side.
      return lastPage.length === PAGE_SIZE ? allPages.length + 1 : undefined;
    },
    initialPageParam: 1,
  });
}

// ─── User Profile Posts ───────────────────────────────────────────────────────
export function useProfilePosts(
  authorId: string | undefined,
  type: 'all' | 'posts' | 'reposts' = 'all',
  enabled = true,
) {
  return useInfiniteQuery({
    queryKey: [...queryKeys.profilePosts(authorId || ''), type],
    queryFn: async ({ pageParam = 1 }) => {
      const res = await postsService.getUserPosts(authorId!, pageParam, PAGE_SIZE, type);
      return Array.isArray(res) ? res : (res.data || []);
    },
    getNextPageParam: (lastPage, allPages) => {
      return lastPage.length === PAGE_SIZE ? allPages.length + 1 : undefined;
    },
    initialPageParam: 1,
    enabled: enabled && !!authorId,
  });
}

// ─── Community Posts ──────────────────────────────────────────────────────────
export function useCommunityPosts(communityId: string | undefined, enabled = true) {
  return useInfiniteQuery({
    queryKey: [...queryKeys.communityPosts(communityId || '')],
    queryFn: async ({ pageParam = 1 }) => {
      const res = await communityService.getCommunityPosts(communityId!, pageParam, PAGE_SIZE);
      return Array.isArray(res) ? res : (res.data || []);
    },
    getNextPageParam: (lastPage, allPages) => {
      return lastPage.length === PAGE_SIZE ? allPages.length + 1 : undefined;
    },
    initialPageParam: 1,
    enabled: enabled && !!communityId,
  });
}
