/**
 * useContentSession — Generic append-only content session with stable scroll.
 *
 * Uses /content/sessions API for all contexts and presentations.
 * Session is created on every screen mount (no reuse).
 * Session is append-only: new content only gets added at the end.
 * Session TTL is 1 hour (garbage collection only).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { postsService } from '../services/posts.service';
import type { ContentItem } from '../components/common/contentCards/content';

export type SourceContext = 'home' | 'profile' | 'bookmarks' | 'community' | 'search';
export type Presentation = 'feed' | 'reels';

interface UseContentSessionOptions {
  /** Content items pre-seeded by the caller (e.g. from an existing feed list). */
  initialItems: ContentItem[];
  /** The content item the user tapped — determines `startIndex`. */
  initialContentId: string;
  /** Where the content came from. */
  sourceContext?: SourceContext;
  /** How the content is displayed. */
  presentation?: Presentation;
  /** Scoped id for profile / community contexts. */
  sourceContextId?: string;
  /** Whether the screen is focused. */
  isFocused?: boolean;
}

interface UseContentSessionReturn {
  items: ContentItem[];
  startIndex: number;
  loadMore: () => void;
  hasMore: boolean;
  isLoading: boolean;
  patchItem: (contentId: string, patch: (item: ContentItem) => ContentItem) => void;
}

const PAGE_SIZE = 20;

/** Wrap a Post into a ContentItem for the session layer. */
function toContentItem(post: any): ContentItem {
  return { itemType: 'post', id: post.id, data: post };
}

function deduplicateItems(items: ContentItem[]): ContentItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

export function useContentSession({
  initialItems,
  initialContentId,
  sourceContext = 'home',
  presentation = 'feed',
  sourceContextId,
  isFocused = true,
}: UseContentSessionOptions): UseContentSessionReturn {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [items, setItems] = useState<ContentItem[]>(() => deduplicateItems(initialItems));
  const [nextOffset, setNextOffset] = useState<number>(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreatingSession, setIsCreatingSession] = useState(false);

  const isFetchingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const startIndex = useMemo(() => {
    const idx = items.findIndex((item) => item.id === initialContentId);
    return Math.max(0, idx);
  }, [items, initialContentId]);

  // Create session on mount
  useEffect(() => {
    if (sessionId) return;
    if (isCreatingSession) return;

    const createSession = async () => {
      setIsCreatingSession(true);
      try {
        const options: any = { sourceContext, presentation };

        if (presentation === 'reels') {
          options.seedContentIds = initialItems.map((item) => item.id);
          options.initialContentId = initialContentId;
        }

        if (sourceContextId) {
          options.sourceContextId = sourceContextId;
        }

        const result = await postsService.createContentSession(options);

        if (!mountedRef.current) return;

        if (result.session && result.posts.length > 0) {
          setSessionId(result.session.id);
          setItems(deduplicateItems(result.posts.map(toContentItem)));
          setNextOffset(result.posts.length);
          setHasMore(result.posts.length >= PAGE_SIZE);
        }
      } catch {
        setHasMore(false);
      } finally {
        if (mountedRef.current) {
          setIsCreatingSession(false);
        }
      }
    };

    createSession();
  }, [sourceContext, presentation, sessionId, isCreatingSession, initialItems, initialContentId, sourceContextId]);

  // Load more items (auto-extends when exhausted)
  const loadMore = useCallback(async () => {
    if (!hasMore || isFetchingRef.current || !sessionId) return;
    isFetchingRef.current = true;
    setIsLoading(true);

    try {
      const result = await postsService.loadContentSessionPage(
        sessionId,
        nextOffset,
        PAGE_SIZE,
      );

      if (!mountedRef.current) return;

      if (result.posts.length === 0 || !result.hasMore) {
        setHasMore(false);
      }

      setNextOffset(result.nextOffset);
      setItems((prev) => deduplicateItems([...prev, ...result.posts.map(toContentItem)]));
    } catch {
      // Silently ignore
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
      isFetchingRef.current = false;
    }
  }, [hasMore, sessionId, nextOffset]);

  const patchItem = useCallback((contentId: string, patch: (item: ContentItem) => ContentItem) => {
    setItems((prev) => prev.map((item) => (item.id === contentId ? patch(item) : item)));
  }, []);

  return {
    items,
    startIndex,
    loadMore,
    hasMore,
    isLoading,
    patchItem,
  };
}
