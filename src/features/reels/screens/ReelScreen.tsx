/**
 * ReelScreen — Full-screen, paginated, snap-scroll content viewer.
 *
 * Architecture:
 *   - useContentSession: append-only session with auto-extension
 *   - SharedReels: generic reel presentation (mirrors SharedFeed)
 *   - ReelCard: type-specific rendering (mirrors FeedCard)
 *   - contentCache: centralized content mutations across ALL query caches
 *   - CommentsBottomSheet / ShareSheet for interactions
 *
 * No back button — swipe down to dismiss. Route name stays "PostDetail".
 */
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  RefreshControl,
  StatusBar,
  StyleSheet,
  View,
} from "react-native";
import { useRouter, useLocalSearchParams, useIsFocused } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";

import { useAuth } from "../../auth/state/AuthProvider";
import { postsService } from "../../posts/api/posts.api";
import { useContentSession } from "../../progression/hooks/useContentSession";
import {
  patchContentInAllCaches,
  removeContentFromAllCaches,
} from "../../feed/cache/content-cache";
import type { Post } from "../../../shared/types";

import SharedReels, { type ReelCtx } from "../components/SharedReels";
import type { ContentItem } from "../../feed/components/content-cards/content-card.types";
import { getContentType } from "../../feed/components/content-cards/content-card.types";
import CommentsBottomSheet from "../../posts/components/CommentsBottomSheet";
import ShareSheet from "../../chat/components/ShareSheet";
import { stageScreenParams, takeScreenParams } from "../../../shared/state/screen-params";

export default function ReelScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  // Staged reel params (post + optional feed deck) — consumed exactly once on
  // mount so re-renders keep the same initial post.
  const [staged] = useState(() =>
    takeScreenParams<{
      post?: Post;
      feedItems?: any[];
      feedContext?: string;
      feedContextId?: string;
      isSinglePost?: boolean;
    }>("reel"),
  );
  const {
    post: initialPost,
    feedItems = [],
    feedContext = "home",
    feedContextId,
    isSinglePost = false,
  } = staged || {};

  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();

  // ── Post resolution ─────────────────────────────────────────────────────
  // The URL only carries the post id (deep-linkable). When no post was staged
  // (cold link / web), fetch it so the session still seeds the viewer.
  const [fetchedPost, setFetchedPost] = useState<Post | null>(null);
  useEffect(() => {
    if (initialPost || !id) return;
    let cancelled = false;
    postsService
      .getPost(id)
      .then((res) => {
        if (!cancelled) setFetchedPost(res?.data || null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [initialPost, id]);
  const post = initialPost || fetchedPost;

  // ── Seed items ──────────────────────────────────────────────────────────
  // feedItems can be Post[] (legacy) or ContentItem[] (from SharedFeed).
  // ContentItem.id is always a bare UUID — no prefix normalization needed.
  const seedItems = useMemo<ContentItem[]>(() => {
    const anyPost = post as any;
    const validFeedItems = (feedItems || []).filter((i: any) => !!i && (i.id || i.data?.id));
    const targetId = anyPost?.id || anyPost?.data?.id;

    if (validFeedItems.length > 0 && validFeedItems[0]?.itemType !== undefined) {
      // Already ContentItem[] from SharedFeed.
      const items = validFeedItems as ContentItem[];
      const has = items.some((i) => (i?.id || i?.data?.id) === targetId);
      if (has || !targetId) return items;
      return [{ itemType: "post", id: targetId, data: anyPost?.data || anyPost }, ...items];
    }

    // Legacy Post[] — wrap each as ContentItem with itemType "post"
    const validPosts = validFeedItems.map((p: any) => (p.data ? p.data : p)).filter((p: any) => !!p && !!p.id);
    if (validPosts.length === 0) {
      return targetId ? [{ itemType: "post", id: targetId, data: anyPost?.data || anyPost }] : [];
    }
    const has = targetId ? validPosts.some((p: any) => p.id === targetId) : true;
    const wrapped = validPosts.map((p: any) => ({ itemType: "post", id: p.id, data: p } as ContentItem));
    return has ? wrapped : (targetId ? [{ itemType: "post", id: targetId, data: anyPost?.data || anyPost }, ...wrapped] : wrapped);
  }, [feedItems, post]);

  const isFocused = useIsFocused();

  const {
    items,
    startIndex,
    loadMore,
    hasMore,
    isLoading,
    patchItem,
    refresh: refreshSession,
  } = useContentSession({
    initialItems: seedItems,
    initialContentId: post?.id || id || "",
    sourceContext: feedContext as any,
    presentation: "reels",
    sourceContextId: feedContextId,
    isFocused,
  });

  // ── Pull-to-refresh ──────────────────────────────────────────────────────
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["feed"] }),
        refreshSession?.(),
      ]);
    } catch {
      // ignore
    } finally {
      setRefreshing(false);
    }
  }, [queryClient, refreshSession]);

  // ── Active index ─────────────────────────────────────────────────────────
  const [activeIndex, setActiveIndex] = useState(startIndex);

  // ── Initial view record ──────────────────────────────────────────────────
  useEffect(() => {
    if (!post) return;
    const type = (post as any).itemType || "post";
    if (type === "post" || type === "poll") {
      postsService.recordView((post as any).data?.id || post.id).catch(() => {});
    }
  }, [post]);

  // ── Centralized cache sync ───────────────────────────────────────────────
  const handleLike = useCallback(
    (contentId: string) => {
      const current = items.find((item) => item.id === contentId);
      if (!current) return;
      const post = current.data;
      const wasLiked = !!post.isLiked;
      const base = post.likes ?? post.likesCount ?? 0;
      const next = wasLiked ? Math.max(0, base - 1) : base + 1;

      patchItem(contentId, (item) => ({
        ...item,
        data: { ...item.data, isLiked: !wasLiked, likes: next, likesCount: next },
      }));

      patchContentInAllCaches(queryClient, contentId, (cp) => ({
        ...cp,
        isLiked: !wasLiked,
        likes: (cp.likes ?? cp.likesCount ?? 0) + (wasLiked ? -1 : 1),
        likesCount: (cp.likes ?? cp.likesCount ?? 0) + (wasLiked ? -1 : 1),
      }));

      postsService.toggleLike(contentId, wasLiked).catch(() => {
        patchItem(contentId, (item) => ({
          ...item,
          data: { ...item.data, isLiked: wasLiked, likes: base, likesCount: base },
        }));
        patchContentInAllCaches(queryClient, contentId, (cp) => ({
          ...cp,
          isLiked: wasLiked,
          likes: base,
          likesCount: base,
        }));
      });
    },
    [items, patchItem, queryClient],
  );

  const handleSave = useCallback(
    (contentId: string) => {
      const current = items.find((item) => item.id === contentId);
      if (!current) return;
      const wasSaved = !!current.data.isSaved;

      patchItem(contentId, (item) => ({
        ...item,
        data: { ...item.data, isSaved: !wasSaved },
      }));
      patchContentInAllCaches(queryClient, contentId, (cp) => ({
        ...cp,
        isSaved: !wasSaved,
      }));

      postsService.toggleSave(contentId, wasSaved).catch(() => {
        patchItem(contentId, (item) => ({
          ...item,
          data: { ...item.data, isSaved: wasSaved },
        }));
        patchContentInAllCaches(queryClient, contentId, (cp) => ({
          ...cp,
          isSaved: wasSaved,
        }));
      });
    },
    [items, patchItem, queryClient],
  );

  // ── Navigation ───────────────────────────────────────────────────────────
  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/");
    }
  }, [router]);

  const handleDelete = useCallback(
    (post: Post) => {
      postsService
        .deletePost(post.id)
        .then(() => {
          removeContentFromAllCaches(queryClient, post.id);
          goBack();
        })
        .catch(() => {});
    },
    [queryClient, goBack],
  );

  const handleAuthorPress = useCallback(
    (post: Post) => {
      const author = (post as any).author;
      if (!author) return;
      stageScreenParams("user", { user: author });
      router.push(`/user/${author.username || author.id}`);
    },
    [router],
  );

  // ── Comments / Share ─────────────────────────────────────────────────────
  const [commentsPost, setCommentsPost] = useState<Post | null>(null);
  const [shareVisible, setShareVisible] = useState(false);
  const [sharePost, setSharePost] = useState<Post | null>(null);

  const handleCountChange = useCallback(
    (contentId: string, delta: number) => {
      patchItem(contentId, (item) => ({
        ...item,
        data: {
          ...item.data,
          comments: Math.max(0, (item.data.comments ?? 0) + delta),
          commentsCount: Math.max(0, (item.data.commentsCount ?? 0) + delta),
        },
      }));
    },
    [patchItem],
  );

  // ── Build ReelCtx ────────────────────────────────────────────────────────
  const reelCtx: ReelCtx = useMemo(
    () => ({
      activeContentId: isFocused ? (items[activeIndex]?.id || null) : null,
      toggleLike: handleLike,
      toggleSave: handleSave,
      sharePost: (post) => {
        setSharePost(post);
        setShareVisible(true);
      },
      openPost: (post) => {
        stageScreenParams("reel", { post });
        router.push(`/post/${post?.id}`);
      },
      openComments: (post) => setCommentsPost(post),
      openUser: (user) => {
        stageScreenParams("user", { user });
        router.push(`/user/${user?.username || user?.id}`);
      },
      openCommunity: (slug) => {
        router.push(`/community/${slug}`);
      },
      openGames: (id?: string) => {
        if (id) {
          router.navigate({ pathname: "/games", params: { openGameId: id, autoPlay: "true" } } as never);
        } else {
          router.navigate("/games");
        }
      },
      openEvents: (id?: string, eventData?: any) => {
        if (id || eventData) {
          const eventItem = items.find(
            (i) =>
              (i.itemType === "events" || i.itemType === "event") &&
              (i.data?.id === id || i.id === id),
          );
          const event = eventData || eventItem?.data || (id ? { id } : undefined);
          stageScreenParams("event", { event });
          router.push(`/events/${id || event?.id}` as never);
        } else {
          router.navigate("/events");
        }
      },
      feedItems: items,
      feedContext,
      feedContextId,
    }),
    [
      items,
      activeIndex,
      isFocused,
      handleLike,
      handleSave,
      router,
      feedContext,
      feedContextId,
    ],
  );

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      <StatusBar hidden translucent backgroundColor="transparent" />

      <SharedReels
        items={items}
        reelCtx={reelCtx}
        initialIndex={isSinglePost ? 0 : startIndex}
        onEndReached={isSinglePost ? undefined : loadMore}
        disableSwipeDown={isSinglePost}
        onDismiss={goBack}
        hasMore={hasMore}
        isLoading={isLoading}
        onRefresh={handleRefresh}
        refreshing={refreshing}
        onActiveItemChange={(_item, index) => {
          setActiveIndex(index);
          const current = items[index];
          if (current) {
            const type = getContentType(current);
            // Only record views for post/poll content — community, event,
            // game etc. have their own endpoints and would 400 here.
            if (type === "post" || type === "poll") {
              postsService.recordView(current.data?.id || current.id).catch(
                () => {},
              );
            }
          }
        }}
      />

      <CommentsBottomSheet
        post={commentsPost}
        onClose={() => setCommentsPost(null)}
        onCountChange={handleCountChange}
      />
      <ShareSheet
        visible={shareVisible}
        onClose={() => setShareVisible(false)}
        postId={sharePost?.id || ""}
        postTitle={
          (sharePost as any)?.title || sharePost?.content?.slice(0, 80)
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000000" },
});
