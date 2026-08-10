import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { queryKeys } from '../lib/queryKeys';
import { communityService } from '../services/community.service';

export function useCommunities(search = '', mine = false) {
  const trimmed = search.trim();
  return useInfiniteQuery({
    queryKey: [...queryKeys.communities, 'discover', trimmed, mine ? 'mine' : 'all'],
    queryFn: async ({ pageParam = 1 }) => {
      const res = await communityService.getCommunities(
        pageParam as number,
        20,
        trimmed || undefined,
        mine || undefined,
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

/**
 * Flat list of every community the current user can post to (joined + owned).
 * Used by the create-post audience picker and the repost destination chips —
 * both previously read a CommunityContext that is never mounted, so they
 * always rendered an empty list. Shares the react-query cache with the
 * community tab (same queryKey), so visiting Communities first warms it.
 */
export function useMyCommunities() {
  const query = useCommunities();
  return (query.data?.pages || []).flatMap((p: any) => p.items) || [];
}

export function useCommunity(id: string) {
  return useQuery({
    queryKey: queryKeys.community(id),
    queryFn: async () => {
      const res = await communityService.getCommunityDetail(id);
      return res.data;
    },
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
