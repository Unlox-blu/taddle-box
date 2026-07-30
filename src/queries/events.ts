import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../lib/queryKeys';
import { eventService } from '../services/event.service';

export function useEvents(searchQuery: string = '', selectedType: string | null = null) {
  return useQuery({
    queryKey: [...queryKeys.events, { searchQuery, selectedType }],
    queryFn: async () => {
      const res = await eventService.discoverEvents({ q: searchQuery, filter: selectedType || undefined, page: 1, limit: 50 });
      return Array.isArray(res) ? res : (res.data || []);
    },
  });
}
