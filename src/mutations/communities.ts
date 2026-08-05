import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../lib/queryKeys';
import { communityService } from '../services/community.service';
import type { Community } from '../types';

export function useCreateCommunity() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: FormData | any) => communityService.createCommunity(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.communities });
    },
  });
}

export function useJoinCommunity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      communityId,
      isCurrentlyMember,
      isPending,
    }: {
      communityId: string;
      isCurrentlyMember: boolean;
      isPending?: boolean;
    }) => {
      // Pending request → tapping again cancels it.
      if (isPending) {
        await communityService.leaveCommunity(communityId);
      } else if (isCurrentlyMember) {
        await communityService.leaveCommunity(communityId);
      } else {
        await communityService.joinCommunity(communityId);
      }
    },
    onMutate: async ({ communityId, isCurrentlyMember, isPending }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.communities });
      const previousCommunities = queryClient.getQueryData(queryKeys.communities);

      queryClient.setQueryData(queryKeys.communities, (old: any) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page: Community[]) =>
            page.map(c => {
              if (c.id !== communityId) return c;
              // Cancelling a pending request: only clears the pending flag —
              // a pending member was never counted in memberCount.
              if (isPending) {
                return { ...c, isPending: false };
              }
              // Leaving an active membership.
              if (isCurrentlyMember) {
                return {
                  ...c,
                  isMember: false,
                  isPending: false,
                  memberCount: Math.max(0, c.memberCount - 1),
                };
              }
              // Joining a private community creates a pending request, not
              // an active membership — don't bump memberCount.
              if (c.privacy === 'private') {
                return { ...c, isPending: true };
              }
              return {
                ...c,
                isMember: true,
                memberCount: c.memberCount + 1,
              };
            }),
          ),
        };
      });

      return { previousCommunities };
    },
    onError: (err, variables, context: any) => {
      if (context?.previousCommunities) {
        queryClient.setQueryData(queryKeys.communities, context.previousCommunities);
      }
    },
    onSettled: (data, error, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.communities });
      queryClient.invalidateQueries({ queryKey: queryKeys.community(variables.communityId) });
    },
  });
}
