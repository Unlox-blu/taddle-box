import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000, // 1 minute
      gcTime: 5 * 60 * 1000, // 5 minutes — frees cached query data sooner on mobile
      retry: 2,
      refetchOnReconnect: true,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
    },
  },
});
