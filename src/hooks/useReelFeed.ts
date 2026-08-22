import { useCallback, useEffect, useRef, useState } from 'react';
import { postsService } from '../services/posts.service';
import type { Post } from '../types';

export type ReelFeedContext =
  | 'feed'
  | 'profile'
  | 'bookmarks'
  | 'community'
  | 'search';

interface UseReelFeedOptions {
  /** Posts pre-seeded by the caller (e.g. from an existing feed list). */
  initialPosts: Post[];
  /** The post the user tapped — determines `startIndex`. */
  startPostId: string;
  feedContext?: ReelFeedContext;
  /** userId for 'profile', communitySlug for 'community'. */
  feedContextId?: string;
}

interface UseReelFeedReturn {
  posts: Post[];
  startIndex: number;
  loadMore: () => void;
  hasMore: boolean;
  isLoading: boolean;
  /** Patch a single post in the list (for optimistic like/save/repost). */
  patchPost: (postId: string, patch: (p: Post) => Post) => void;
}

export function useReelFeed({
  initialPosts,
  startPostId,
  feedContext = 'feed',
  feedContextId,
}: UseReelFeedOptions): UseReelFeedReturn {
  const [posts, setPosts] = useState<Post[]>(() =>
    initialPosts.length > 0 ? initialPosts : [],
  );
  const [page, setPage] = useState(2); // page 1 = initialPosts
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const isFetchingRef = useRef(false);

  // Compute stable start index from startPostId.
  const startIndex = Math.max(
    0,
    posts.findIndex((p) => p.id === startPostId),
  );

  // If the caller provided no/few posts, auto-fetch the first page on mount.
  useEffect(() => {
    if (initialPosts.length < 5 && !isFetchingRef.current) {
      fetchPage(1, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchPage = useCallback(
    async (pageNum: number, replace = false) => {
      if (isFetchingRef.current) return;
      isFetchingRef.current = true;
      setIsLoading(true);
      try {
        let fetched: Post[] = [];

        switch (feedContext) {
          case 'profile':
            if (feedContextId) {
              const res = await postsService.getUserPosts(feedContextId, pageNum, 20);
              fetched = res.data || [];
            }
            break;
          case 'bookmarks': {
            const res = await postsService.getBookmarks(pageNum, 20);
            fetched = res.data || [];
            break;
          }
          default: {
            // 'feed' | 'community' | 'search' — fall back to global feed
            const res = await postsService.getFeed(pageNum, 20);
            fetched = res.data || [];
            break;
          }
        }

        if (fetched.length < 20) setHasMore(false);

        setPosts((prev) => {
          if (replace) return fetched;
          // Deduplicate by id before appending.
          const existingIds = new Set(prev.map((p) => p.id));
          const deduped = fetched.filter((p) => !existingIds.has(p.id));
          return [...prev, ...deduped];
        });
        setPage(pageNum + 1);
      } catch {
        // Silently ignore — the user still sees whatever posts we have.
      } finally {
        setIsLoading(false);
        isFetchingRef.current = false;
      }
    },
    [feedContext, feedContextId],
  );

  const loadMore = useCallback(() => {
    if (!hasMore || isFetchingRef.current) return;
    fetchPage(page);
  }, [fetchPage, hasMore, page]);

  const patchPost = useCallback((postId: string, patch: (p: Post) => Post) => {
    setPosts((prev) => prev.map((p) => (p.id === postId ? patch(p) : p)));
  }, []);

  return { posts, startIndex, loadMore, hasMore, isLoading, patchPost };
}
