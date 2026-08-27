import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../lib/queryKeys';
import { postsService } from '../services/posts.service';
import type { Post } from '../types';
import type { FeedRow } from '../components/common/SharedFeed';

export function useCreatePost() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (postData: any) => postsService.createPost(postData),
    onSuccess: () => {
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
      await queryClient.cancelQueries({ queryKey: queryKeys.bookmarks });
      // Cancel all profile post queries (all authorIds + types)
      queryClient.getQueryCache().findAll({ queryKey: queryKeys.feed }).forEach(() => {}); // noop — just to keep pattern
      const profileQueries = queryClient.getQueryCache().findAll({ predicate: (q) => q.queryKey[0] === 'profile' && q.queryKey[2] === 'posts' });
      await Promise.all(profileQueries.map((q) => queryClient.cancelQueries({ queryKey: q.queryKey })));

      const nextLiked = !isCurrentlyLiked;
      const prevData: [readonly unknown[], unknown][] = [];

      // Patch feed caches (flat Post[] pages)
      queryClient.getQueryCache().findAll({ queryKey: queryKeys.feed }).forEach((query) => {
        prevData.push([query.queryKey, queryClient.getQueryData(query.queryKey)]);
        queryClient.setQueryData(query.queryKey, (old: any) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page: Post[]) =>
              page.map((post) => {
                if (post.id === id) {
                  const currentLikes = post.likes ?? (post as any).likesCount ?? 0;
                  const newLikes = isCurrentlyLiked ? Math.max(0, currentLikes - 1) : currentLikes + 1;
                  return { ...post, isLiked: nextLiked, likes: newLikes, likesCount: newLikes };
                }
                return post;
              })
            ),
          };
        });
      });

      // Patch bookmarks cache (FeedRow[] pages)
      queryClient.getQueryCache().findAll({ queryKey: queryKeys.bookmarks }).forEach((query) => {
        prevData.push([query.queryKey, queryClient.getQueryData(query.queryKey)]);
        queryClient.setQueryData(query.queryKey, (old: any) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page: FeedRow[]) =>
              page.map((row) => {
                if ((row.item as any)?.id === id) {
                  const currentLikes = (row.item as any).likes ?? (row.item as any).likesCount ?? 0;
                  const newLikes = isCurrentlyLiked ? Math.max(0, currentLikes - 1) : currentLikes + 1;
                  return { ...row, item: { ...row.item, isLiked: nextLiked, likes: newLikes, likesCount: newLikes } };
                }
                return row;
              })
            ),
          };
        });
      });

      // Patch profile post caches (FeedRow[] pages)
      profileQueries.forEach((query) => {
        prevData.push([query.queryKey, queryClient.getQueryData(query.queryKey)]);
        queryClient.setQueryData(query.queryKey, (old: any) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page: FeedRow[]) =>
              page.map((row) => {
                if ((row.item as any)?.id === id) {
                  const currentLikes = (row.item as any).likes ?? (row.item as any).likesCount ?? 0;
                  const newLikes = isCurrentlyLiked ? Math.max(0, currentLikes - 1) : currentLikes + 1;
                  return { ...row, item: { ...row.item, isLiked: nextLiked, likes: newLikes, likesCount: newLikes } };
                }
                return row;
              })
            ),
          };
        });
      });

      return { previous: prevData };
    },
    onError: (_err: any, _vars: any, context: any) => {
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

      // Patch all feed variants + bookmarks + profile posts caches so the
      // bookmark icon flips instantly everywhere.
      queryClient.getQueryCache().findAll({ queryKey: queryKeys.feed })
        .forEach((query) => flipSavedInCache(queryClient, query.queryKey, id, nextSaved));
      flipSavedInCache(queryClient, BOOKMARKS_KEY, id, nextSaved);
      // Profile post caches store FeedRow[] — patch item.isSaved
      queryClient.getQueryCache().findAll({ predicate: (q) => q.queryKey[0] === 'profile' && q.queryKey[2] === 'posts' })
        .forEach((query) => {
          queryClient.setQueryData(query.queryKey, (old: any) => {
            if (!old) return old;
            return {
              ...old,
              pages: old.pages.map((page: FeedRow[]) =>
                page.map((row) => (row.item as any)?.id === id ? { ...row, item: { ...row.item, isSaved: nextSaved } } : row)
              ),
            };
          });
        });
      
      return { previousFeed, previousBookmarks };
    },
    onError: (_err: any, _vars: any, context: any) => {
      if (context?.previousFeed) {
        queryClient.setQueryData(queryKeys.feed, context.previousFeed);
      }
      if (context?.previousBookmarks) {
        queryClient.setQueryData(BOOKMARKS_KEY, context.previousBookmarks);
      }
    },
    onSettled: () => {
      // Bookmarks + profile posts need a refetch (newly saved post must appear
      // there; flipping isSaved in the cache can't add rows). The feed variants
      // were already patched optimistically in onMutate.
      queryClient.invalidateQueries({ queryKey: BOOKMARKS_KEY });
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'profile' && q.queryKey[2] === 'posts' });
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
