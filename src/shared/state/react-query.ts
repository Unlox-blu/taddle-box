import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000, // 1 minute
      gcTime: 5 * 60 * 1000, // 5 minutes — frees cached query data sooner on mobile
      retry: 2,
      refetchOnReconnect: true,
      // Refetch on EVERY mount, regardless of staleness. Cached data still
      // renders instantly as the placeholder, but a fresh request always goes
      // out — so navigating back to bookmarks/profile/events/wallet/communities
      // etc. shows live data instead of a stale snapshot. (Previously false,
      // which meant cache-only on re-entry: stale posts until cold boot.)
      // Tab roots that stay mounted (Home, Events, Communities, Games, Wallet)
      // additionally refetch on focus via their own useFocusEffect.
      refetchOnMount: 'always',
      refetchOnWindowFocus: false,
    },
  },
});
