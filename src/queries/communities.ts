import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { queryKeys } from '../lib/queryKeys';
import { communityService } from '../services/community.service';

export function useCommunities() {
  return useInfiniteQuery({
    queryKey: queryKeys.communities,
    queryFn: async ({ pageParam = 1 }) => {
      const res = await communityService.getCommunities(pageParam as number, 20);
      return Array.isArray(res) ? res : (res.data || []);
    },
    getNextPageParam: (lastPage, allPages) => {
      return lastPage.length === 20 ? allPages.length + 1 : undefined;
    },
    initialPageParam: 1,
  });
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
