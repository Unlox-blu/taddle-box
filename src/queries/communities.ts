import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { queryKeys } from '../lib/queryKeys';
import { communityService } from '../services/community.service';

export function useCommunityCategories() {
  return useQuery({
    queryKey: [...queryKeys.communities, 'categories'],
    queryFn: async () => {
      const res = await communityService.getCommunityCategories();
      return Array.isArray(res) ? res : (res.data || []);
    },
  });
}

export function useCommunities(
  searchQuery = '',
  filter?: string,
  category?: string,
  options?: { enabled?: boolean }
) {
  const trimmed = searchQuery.trim();
  return useInfiniteQuery({
    queryKey: [...queryKeys.communities, 'discover', trimmed, filter, category],
    enabled: options?.enabled ?? true,
    queryFn: async ({ pageParam = 1 }) => {
      const res = await communityService.getCommunities(
        pageParam as number,
        20,
        trimmed || undefined,
        undefined, // mine
        category || undefined,
        filter || undefined
      );
      const items = Array.isArray(res) ? res : (res.data || []);
      // Sections ride along from the server (ordered descriptor). Page 1
      // carries it; the screen renders its sections in that order.
      return { items, sections: (res as any)?.sections || null };
    },
    getNextPageParam: (lastPage, allPages) => {
      return lastPage.items.length === 20 ? allPages.length + 1 : undefined;
    },
    initialPageParam: 1,
  });
}

export function useJoinedCommunities(search = '', enabled = true) {
  const trimmed = search.trim();
  return useInfiniteQuery({
    queryKey: [...queryKeys.communities, 'joined', trimmed],
    // Gated by the caller: the create-post audience picker mounts this list
    // while its own modal is closed (RN hides the children but they stay in
    // the tree during dismiss), so the joined-communities fetch must wait for
    // the picker to actually open.
    enabled,
    queryFn: async ({ pageParam = 1 }) => {
      const res = await communityService.getCommunities(
        pageParam as number,
        20,
        trimmed || undefined,
        true // mine = true
      );
      const items = Array.isArray(res) ? res : (res.data || []);
      return { items, sections: (res as any)?.sections || null };
    },
    getNextPageParam: (lastPage, allPages) => {
      return lastPage.items.length === 20 ? allPages.length + 1 : undefined;
    },
    initialPageParam: 1,
  });
}

/**
 * Flat list of every community the current user can post to (joined + owned).
 * Used by the create-post audience picker and the repost destination chips —
 * both previously read a CommunityContext that is never mounted, so they
 * always rendered an empty list. Shares the react-query cache with the
 * community tab (same queryKey), so visiting Communities first warms it.
 */
export function useMyCommunities(enabled = true) {
  // Gated by the caller: the repost sheet and create-post audience picker are
  // interaction-driven, so this must NOT fire while the app just sits on the
  // Home feed (it shares the discover query key, so visiting Communities tab
  // still warms the same cache).
  const query = useCommunities('', undefined, undefined, { enabled });
  return (query.data?.pages || []).flatMap((p: any) => p.items) || [];
}

export function useCommunity(id: string) {
  return useQuery({
    queryKey: queryKeys.community(id),
    queryFn: async () => {
      const res = await communityService.getCommunityDetail(id);
      return res.data;
    },
    enabled: !!id,
  });
}

export function useCommunityPosts(id: string) {
  return useInfiniteQuery({
    queryKey: queryKeys.communityPosts(id),
    queryFn: async ({ pageParam = 1 }) => {
      const res = await communityService.getCommunityPosts(id, pageParam as number, 20);
      return Array.isArray(res) ? res : (res.data || []);
    },
    getNextPageParam: (lastPage, allPages) => {
      return lastPage.length === 20 ? allPages.length + 1 : undefined;
    },
    initialPageParam: 1,
  });
}
