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
      
      const previousFeed = queryClient.getQueryData(queryKeys.feed);
      
      queryClient.setQueryData(queryKeys.feed, (old: any) => {
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
      
      return { previousFeed };
    },
    onError: (err, variables, context: any) => {
      if (context?.previousFeed) {
        queryClient.setQueryData(queryKeys.feed, context.previousFeed);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.feed });
    },
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
      const previousFeed = queryClient.getQueryData(queryKeys.feed);
      
      queryClient.setQueryData(queryKeys.feed, (old: any) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page: Post[]) =>
            page.map((post) => post.id === id ? { ...post, isSaved: !isCurrentlySaved } : post)
          ),
        };
      });
      
      return { previousFeed };
    },
    onError: (err, variables, context: any) => {
      if (context?.previousFeed) {
        queryClient.setQueryData(queryKeys.feed, context.previousFeed);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.feed });
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
