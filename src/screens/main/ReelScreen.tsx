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
import { useIsFocused } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useQueryClient } from "@tanstack/react-query";

import { useAuth } from "../../context/AuthContext";
import { postsService } from "../../services/posts.service";
import { useContentSession } from "../../hooks/useContentSession";
import {
  patchContentInAllCaches,
  removeContentFromAllCaches,
} from "../../lib/contentCache";
import type { RootStackParamList, Post } from "../../types";

import SharedReels, { type ReelCtx } from "../../components/common/SharedReels";
import type { ContentItem } from "../../components/common/contentCards/content";
import { getContentType } from "../../components/common/contentCards/content";
import CommentsBottomSheet from "../../components/home/CommentsBottomSheet";
import ShareSheet from "../../components/common/ShareSheet";

type Props = NativeStackScreenProps<RootStackParamList, "PostDetail">;

export default function ReelScreen({ navigation, route }: Props) {
  const {
    post: initialPost,
    feedItems = [],
    feedContext = "home",
    feedContextId,
    isSinglePost = false,
  } = route.params as any;

  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();

  // ── Seed items ──────────────────────────────────────────────────────────
  // feedItems can be Post[] (legacy) or ContentItem[] (from SharedFeed).
  // ContentItem.id is always a bare UUID — no prefix normalization needed.
  const seedItems = useMemo<ContentItem[]>(() => {
    const hasItems = feedItems.length > 0 && feedItems[0]?.itemType !== undefined;

    if (hasItems) {
      // Already ContentItem[] from SharedFeed.
      const items = feedItems as ContentItem[];
      const has = items.some((i) => i.id === initialPost?.id || i.data?.id === initialPost?.id);
      if (has) return items;
      return [{ itemType: "post", id: initialPost.id, data: initialPost }, ...items];
    }

    // Legacy Post[] — wrap each as ContentItem with itemType "post"
    if (feedItems.length === 0) return [{ itemType: "post", id: initialPost.id, data: initialPost }];
    const has = feedItems.some((p: Post) => p.id === initialPost.id);
    const wrapped = feedItems.map((p: Post) => ({ itemType: "post", id: p.id, data: p } as ContentItem));
    return has ? wrapped : [{ itemType: "post", id: initialPost.id, data: initialPost }, ...wrapped];
  }, [feedItems, initialPost]);

  const isFocused = useIsFocused();

  const {
    items,
    startIndex,
    loadMore,
    hasMore,
    isLoading,
    patchItem,
  } = useContentSession({
    initialItems: seedItems,
    initialContentId: initialPost.id,
    sourceContext: feedContext,
    presentation: "reels",
    sourceContextId: feedContextId,
    isFocused,
  });

  // ── Pull-to-refresh ──────────────────────────────────────────────────────
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    queryClient
      .invalidateQueries({ queryKey: ["feed"] })
      .then(() => setRefreshing(false))
      .catch(() => setRefreshing(false));
  }, [queryClient]);

  // ── Active index ─────────────────────────────────────────────────────────
  const [activeIndex, setActiveIndex] = useState(startIndex);

  // ── Initial view record ──────────────────────────────────────────────────
  useEffect(() => {
    postsService.recordView(initialPost.id).catch(() => {});
  }, [initialPost.id]);

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
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      (navigation as any).reset({
        index: 0,
        routes: [{ name: "Main", params: { screen: "Home" } }],
      });
    }
  }, [navigation]);

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
      (navigation as any).push("UserProfile", {
        user: (post as any).author || {},
      });
    },
    [navigation],
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
        (navigation as any).push("PostDetail", { post });
      },
      openComments: (post) => setCommentsPost(post),
      openUser: (user) => {
        (navigation as any).push("UserProfile", { user });
      },
      openCommunity: (slug) => {
        (navigation as any).push("CommunityDetail", { communitySlug: slug });
      },
      openGames: (id?: string) => {
        if (id) {
          (navigation as any).navigate("Main", {
            screen: "Games",
            params: { openGameId: id, autoPlay: true },
          });
        } else {
          (navigation as any).navigate("Main", { screen: "Games" });
        }
      },
      openEvents: (id?: string) => {
        if (id) {
          // Find the event data from current items so EventDetail has
          // a full event object (it reads route.params.event).
          const eventItem = items.find(
            (i) => i.itemType === "events" && i.data?.id === id,
          );
          const event = eventItem
            ? {
                id: eventItem.data.id,
                title: eventItem.data.title ?? "",
                description: eventItem.data.description ?? "",
                cover_image_url: eventItem.data.cover_image_url,
                type: eventItem.data.type ?? "meetup",
                banner: eventItem.data.cover_image_url ?? "",
                date: eventItem.data.date ?? "",
                location: eventItem.data.location ?? "",
                xpReward: eventItem.data.xpReward ?? 0,
                registrations: eventItem.data.registrations ?? 0,
                isLive: eventItem.data.isLive ?? false,
                isFeatured: eventItem.data.isFeatured ?? false,
                isRegistered: eventItem.data.isRegistered ?? false,
                isFree: eventItem.data.isFree ?? true,
              }
            : { id };
          (navigation as any).push("EventDetail", { event });
        } else {
          (navigation as any).navigate("Main", { screen: "Events" });
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
      navigation,
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
