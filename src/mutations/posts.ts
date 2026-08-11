import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../lib/queryKeys';
import { postsService } from '../services/posts.service';
import type { Post } from '../types';

export function useCreatePost() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (postData: any) => postsService.createPost(postData),
    onSuccess: (res) => {
      // Invalidate both global feed and profile posts just to be safe
      queryClient.invalidateQueries({ queryKey: queryKeys.feed });
    },
  });
}

export function useToggleLike() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, isCurrentlyLiked }: { id: string; isCurrentlyLiked: boolean }) => {
      await postsService.toggleLike(id, isCurrentlyLiked);
    },
    onMutate: async ({ id, isCurrentlyLiked }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.feed });

      // Patch EVERY feed variant (['feed'], ['feed', hashtag], …) so the heart
      // flips instantly everywhere. Patching only the bare ['feed'] key would
      // miss the active ['feed', hashtag] queries — which is why the old code
      // had to refetch the whole feed after every like (that refetch is what
      // flashed the pull-to-refresh spinner and yanked/blanked the list).
      const previous: [readonly unknown[], unknown][] = [];
      queryClient.getQueryCache().findAll({ queryKey: queryKeys.feed }).forEach((query) => {
        previous.push([query.queryKey, queryClient.getQueryData(query.queryKey)]);
        queryClient.setQueryData(query.queryKey, (old: any) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page: Post[]) =>
              page.map((post) => {
                if (post.id === id) {
                  const currentLikes = post.likes ?? (post as any).likesCount ?? 0;
                  const newLikes = isCurrentlyLiked ? Math.max(0, currentLikes - 1) : currentLikes + 1;
                  return {
                    ...post,
                    isLiked: !isCurrentlyLiked,
                    likes: newLikes,
                    likesCount: newLikes,
                  };
                }
                return post;
              })
            ),
          };
        });
      });

      return { previous };
    },
    onError: (err, variables, context: any) => {
      context?.previous?.forEach(([key, data]: [readonly unknown[], unknown]) => {
        queryClient.setQueryData(key, data);
      });
    },
    // No onSettled refetch — the optimistic patch above already reflects the
    // change everywhere, and refetching here was the cause of the list jerk.
  });
}

const BOOKMARKS_KEY = ['bookmarks'];

// Flip the isSaved flag on a post inside a react-query infinite-query cache.
function flipSavedInCache(queryClient: any, queryKey: any, id: string, nextSaved: boolean) {
  queryClient.setQueryData(queryKey, (old: any) => {
    if (!old) return old;
    return {
      ...old,
      pages: old.pages.map((page: Post[]) =>
        page.map((post) => post.id === id ? { ...post, isSaved: nextSaved } : post)
      ),
    };
  });
}

export function useToggleSave() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, isCurrentlySaved }: { id: string; isCurrentlySaved: boolean }) => {
      await postsService.toggleSave(id, isCurrentlySaved);
    },
    onMutate: async ({ id, isCurrentlySaved }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.feed });
      await queryClient.cancelQueries({ queryKey: BOOKMARKS_KEY });
      const previousFeed = queryClient.getQueryData(queryKeys.feed);
      const previousBookmarks = queryClient.getQueryData(BOOKMARKS_KEY);
      const nextSaved = !isCurrentlySaved;

      // The feed (and hashtag variants, via partial-key matching) plus the
      // bookmarks page both render the bookmark icon — update them all so the
      // icon flips instantly instead of waiting for a refetch.
      queryClient.getQueryCache().findAll({ queryKey: queryKeys.feed })
        .forEach((query) => flipSavedInCache(queryClient, query.queryKey, id, nextSaved));
      flipSavedInCache(queryClient, BOOKMARKS_KEY, id, nextSaved);
      
      return { previousFeed, previousBookmarks };
    },
    onError: (err, variables, context: any) => {
      if (context?.previousFeed) {
        queryClient.setQueryData(queryKeys.feed, context.previousFeed);
      }
      if (context?.previousBookmarks) {
        queryClient.setQueryData(BOOKMARKS_KEY, context.previousBookmarks);
      }
    },
    onSettled: () => {
      // Only the bookmarks list needs a refetch (a newly saved post must appear
      // there; flipping isSaved in the cache can't add rows). The feed variants
      // were already patched optimistically in onMutate — refetching them is
      // what caused the list to jerk/blank on every save.
      queryClient.invalidateQueries({ queryKey: BOOKMARKS_KEY });
    },
  });
}

export function useDeletePost() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: string) => postsService.deletePost(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.feed });
    },
  });
}
