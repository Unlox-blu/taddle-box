import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '../design-system/theme/ThemeProvider';
import { AuthProvider } from '../features/auth/state/AuthProvider';
import { WalletProvider } from '../features/wallet/state/WalletProvider';
import { GamesProvider } from '../features/games/state/GamesProvider';
import { CommunityProvider } from '../features/community/state/CommunityProvider';
import { PostsProvider } from '../features/feed/state/PostsProvider';
import { NotificationProvider } from '../features/notifications/state/NotificationProvider';
import { ActiveStatusProvider } from '../features/users/state/ActiveStatusProvider';
import { queryClient } from '../shared/state/react-query';

/**
 * The app-wide provider tree. Order matters: outer providers may be consumed
 * by inner ones (e.g. AuthProvider uses the query client). Rendered by the
 * expo-router root layout (src/app/_layout.tsx).
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <WalletProvider>
            <GamesProvider>
              <CommunityProvider>
                <PostsProvider>
                  <NotificationProvider>
                    <ActiveStatusProvider>{children}</ActiveStatusProvider>
                  </NotificationProvider>
                </PostsProvider>
              </CommunityProvider>
            </GamesProvider>
          </WalletProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}