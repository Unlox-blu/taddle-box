import { useInfiniteQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../shared/state/query-keys';
import { eventService } from '../api/events.api';

export function useEvents(searchQuery: string = '', selectedType: string | null = null, scope: string = 'all') {
  return useInfiniteQuery({
    queryKey: [...queryKeys.events, { searchQuery, selectedType, scope }],
    queryFn: async ({ pageParam = 1 }) => {
      const res = await eventService.discoverEvents({ q: searchQuery, filter: selectedType || undefined, page: pageParam as number, limit: 20, scope: scope !== 'all' ? scope : undefined });
      const items = Array.isArray(res) ? res : (res.data || []);
      return items;
    },
    getNextPageParam: (lastPage, allPages) => {
      return lastPage.length === 20 ? allPages.length + 1 : undefined;
    },
    initialPageParam: 1,
  });
}
