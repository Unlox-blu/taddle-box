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
    mutationFn: async ({ communityId, isCurrentlyMember }: { communityId: string; isCurrentlyMember: boolean }) => {
      if (isCurrentlyMember) {
        await communityService.leaveCommunity(communityId);
      } else {
        await communityService.joinCommunity(communityId);
      }
    },
    onMutate: async ({ communityId, isCurrentlyMember }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.communities });
      const previousCommunities = queryClient.getQueryData(queryKeys.communities);

      queryClient.setQueryData(queryKeys.communities, (old: any) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page: Community[]) =>
            page.map(c => c.id === communityId ? { ...c, isMember: !isCurrentlyMember, memberCount: isCurrentlyMember ? c.memberCount - 1 : c.memberCount + 1 } : c)
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
