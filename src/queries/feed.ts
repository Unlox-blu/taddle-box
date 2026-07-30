import { useInfiniteQuery } from '@tanstack/react-query';
import { queryKeys } from '../lib/queryKeys';
import { postsService } from '../services/posts.service';

export function useFeed(hashtag?: string) {
  return useInfiniteQuery({
    queryKey: [...queryKeys.feed, hashtag],
    queryFn: async ({ pageParam = 1 }) => {
      const res = await postsService.getFeed(pageParam, 20, hashtag);
      return Array.isArray(res) ? res : (res.data || []);
    },
    getNextPageParam: (lastPage, allPages) => {
      return lastPage.length === 20 ? allPages.length + 1 : undefined;
    },
    initialPageParam: 1,
  });
}

export function useBookmarks() {
  return useInfiniteQuery({
    queryKey: ['bookmarks'], // Adding to queryKeys is better, but this works for now
    queryFn: async ({ pageParam = 1 }) => {
      const res = await postsService.getBookmarks(pageParam as number, 20);
      return Array.isArray(res) ? res : (res.data || []);
    },
    getNextPageParam: (lastPage, allPages) => {
      return lastPage.length === 20 ? allPages.length + 1 : undefined;
    },
    initialPageParam: 1,
  });
}
