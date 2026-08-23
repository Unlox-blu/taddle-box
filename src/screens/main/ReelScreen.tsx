/**
 * ReelScreen — Full-screen, paginated, snap-scroll post viewer.
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
  Dimensions,
  RefreshControl,
  StatusBar,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useQueryClient } from "@tanstack/react-query";
import {
  GestureHandlerRootView,
  GestureDetector,
  Gesture,
} from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import { FlashList } from "@shopify/flash-list";
import { useAuth } from "../../context/AuthContext";
import { postsService } from "../../services/posts.service";
import { useReelFeed } from "../../hooks/useReelFeed";
import type { RootStackParamList, Post } from "../../types";
import ReelItem from "./ReelItem";
import CommentsBottomSheet from "../../components/home/CommentsBottomSheet";
import ShareSheet from "../../components/common/ShareSheet";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

type Props = NativeStackScreenProps<RootStackParamList, "PostDetail">;

export default function ReelScreen({ navigation, route }: Props) {
  const {
    post: initialPost,
    feedPosts = [],
    feedContext = "feed",
    feedContextId,
    isSinglePost = false,
  } = route.params as any;

  const { user: currentUser } = useAuth();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  // ── Feed list ──────────────────────────────────────────────────────────────
  const seedPosts = useMemo<Post[]>(() => {
    if (feedPosts.length === 0) return [initialPost];
    const has = feedPosts.some((p: Post) => p.id === initialPost.id);
    return has ? feedPosts : [initialPost, ...feedPosts];
  }, [feedPosts, initialPost]);

  const { posts, startIndex, loadMore, hasMore, patchPost } = useReelFeed({
    initialPosts: seedPosts,
    startPostId: initialPost.id,
    feedContext,
    feedContextId,
  });

  // ── Pull-to-refresh ────────────────────────────────────────────────────────
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    queryClient
      .invalidateQueries({ queryKey: ["feed"] })
      .then(() => setRefreshing(false))
      .catch(() => setRefreshing(false));
  }, [queryClient]);

  // ── Active index tracking ──────────────────────────────────────────────────
  const [activeIndex, setActiveIndex] = useState(startIndex);
  const activeIndexRef = useRef(activeIndex);
  activeIndexRef.current = activeIndex;

  // ── Viewability ───────────────────────────────────────────────────────────
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 });
  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (!viewableItems.length) return;
    const newIdx = viewableItems[0].index ?? 0;
    if (newIdx === activeIndexRef.current) return;
    setActiveIndex(newIdx);
    const p = viewableItems[0].item as Post;
    postsService.recordView(p.id).catch(() => {});
    if (!isSinglePost && newIdx >= posts.length - 3) loadMore();
  }).current;

  // ── Swipe-down to dismiss (disabled for single-post mode) ──────────────────
  const dismissY = useSharedValue(0);
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

  const panGesture = isSinglePost
    ? Gesture.Pan().enabled(false)
    : Gesture.Pan()
        .activeOffsetY(10)
        .onUpdate((e) => {
          if (e.translationY > 0) {
            const dampened = e.translationY * 0.6;
            dismissY.value = dampened;
          } else if (e.translationY < -20) {
            dismissY.value = Math.max(-30, e.translationY * 0.25);
          }
        })
        .onEnd((e) => {
          const dragDistance = dismissY.value;
          const vy = e.velocityY;
          const shouldDismiss =
            dragDistance > SCREEN_H * 0.3 || (vy > 400 && dragDistance > 40);

          if (shouldDismiss) {
            const exitDuration = Math.max(
              120,
              Math.min(300, 60000 / Math.max(vy, 1)),
            );
            dismissY.value = withTiming(
              SCREEN_H * 1.1,
              { duration: exitDuration },
              () => {
                runOnJS(goBack)();
              },
            );
          } else {
            dismissY.value = withSpring(0, {
              damping: 18,
              stiffness: 280,
              mass: 0.8,
            });
          }
        });

  const dismissStyle = useAnimatedStyle(() => {
    const ty = dismissY.value;
    const scale = interpolate(
      ty,
      [0, SCREEN_H * 0.5],
      [1, 0.85],
      Extrapolation.CLAMP,
    );
    const opacity = interpolate(
      ty,
      [0, SCREEN_H * 0.6],
      [1, 0],
      Extrapolation.CLAMP,
    );
    const borderRadius = interpolate(
      ty,
      [0, SCREEN_H * 0.5],
      [0, 20],
      Extrapolation.CLAMP,
    );
    return {
      transform: [{ translateY: ty }, { scale }],
      opacity,
      borderRadius,
      overflow: "hidden" as const,
    };
  });

  // ── Initial view record ────────────────────────────────────────────────────
  useEffect(() => {
    postsService.recordView(initialPost.id).catch(() => {});
  }, [initialPost.id]);

  // ── Cache sync helpers ─────────────────────────────────────────────────────
  const patchCachedPosts = useCallback(
    (postId: string, patch: (p: any) => any) => {
      queryClient
        .getQueryCache()
        .findAll()
        .forEach((query) => {
          const key = query.queryKey;
          if (!Array.isArray(key) || key.length === 0) return;
          if (!["feed", "bookmarks", "profile"].includes(key[0] as string))
            return;
          queryClient.setQueryData(key, (old: any) => {
            if (!old || !Array.isArray(old.pages)) return old;
            return {
              ...old,
              pages: old.pages.map((page: any[]) =>
                page.map((p: any) => (p.id === postId ? patch(p) : p)),
              ),
            };
          });
        });
    },
    [queryClient],
  );

  const removeFromCaches = useCallback(
    (postId: string) => {
      queryClient
        .getQueryCache()
        .findAll()
        .forEach((query) => {
          const key = query.queryKey;
          if (!Array.isArray(key) || key.length === 0) return;
          if (!["feed", "bookmarks", "profile"].includes(key[0] as string))
            return;
          queryClient.setQueryData(key, (old: any) => {
            if (!old || !Array.isArray(old.pages)) return old;
            return {
              ...old,
              pages: old.pages.map((page: any[]) =>
                page.filter((p: any) => p.id !== postId),
              ),
            };
          });
        });
    },
    [queryClient],
  );

  // ── Post interaction handlers ──────────────────────────────────────────────
  const handleLike = useCallback(
    (postId: string) => {
      const current = posts.find((p) => p.id === postId);
      if (!current) return;
      const wasLiked = !!current.isLiked;
      const base = current.likes ?? (current as any).likesCount ?? 0;
      const next = wasLiked ? Math.max(0, base - 1) : base + 1;
      patchPost(postId, (p) => ({
        ...p,
        isLiked: !wasLiked,
        likes: next,
        likesCount: next,
      }));
      postsService.toggleLike(postId, wasLiked).catch(() => {
        patchPost(postId, (p) => ({
          ...p,
          isLiked: wasLiked,
          likes: base,
          likesCount: base,
        }));
      });
      patchCachedPosts(postId, (cp) => ({
        ...cp,
        isLiked: !wasLiked,
        likes: (cp.likes ?? cp.likesCount ?? 0) + (wasLiked ? -1 : 1),
        likesCount: (cp.likes ?? cp.likesCount ?? 0) + (wasLiked ? -1 : 1),
      }));
    },
    [posts, patchPost, patchCachedPosts],
  );

  const handleSave = useCallback(
    (postId: string) => {
      const current = posts.find((p) => p.id === postId);
      if (!current) return;
      const wasSaved = !!(current as any).isSaved;
      patchPost(postId, (p) => ({ ...p, isSaved: !wasSaved }));
      postsService.toggleSave(postId, wasSaved).catch(() => {
        patchPost(postId, (p) => ({ ...p, isSaved: wasSaved }));
      });
      patchCachedPosts(postId, (cp) => ({ ...cp, isSaved: !wasSaved }));
    },
    [posts, patchPost, patchCachedPosts],
  );

  const handleDelete = useCallback(
    (post: Post) => {
      postsService
        .deletePost(post.id)
        .then(() => {
          removeFromCaches(post.id);
          goBack();
        })
        .catch(() => {});
    },
    [removeFromCaches, goBack],
  );

  const handleAuthorPress = useCallback(
    (post: Post) => {
      (navigation as any).push("UserProfile", {
        user: (post as any).author || {},
      });
    },
    [navigation],
  );

  // ── Comments / Share ───────────────────────────────────────────────────────
  const [commentsPost, setCommentsPost] = useState<Post | null>(null);
  const [shareVisible, setShareVisible] = useState(false);
  const [sharePost, setSharePost] = useState<Post | null>(null);

  const handleCountChange = useCallback(
    (postId: string, delta: number) => {
      patchPost(postId, (p) => {
        const base = p.comments ?? (p as any).commentsCount ?? 0;
        return {
          ...p,
          comments: Math.max(0, base + delta),
          commentsCount: Math.max(0, base + delta),
        };
      });
    },
    [patchPost],
  );

  // ── FlashList helpers ─────────────────────────────────────────────────────
  const keyExtractor = useCallback((item: Post) => item.id, []);

  const renderItem = useCallback(
    ({ item, index }: { item: Post; index: number }) => {
      const isOwnPost =
        !!currentUser?.id && (item as any)?.author?.id === currentUser.id;
      return (
        <ReelItem
          post={item}
          isActive={index === activeIndex}
          onLike={handleLike}
          onSave={handleSave}
          onCommentPress={setCommentsPost}
          onAuthorPress={handleAuthorPress}
          onDelete={handleDelete}
          onReport={() => {}}
          onShare={() => {
            setSharePost(item);
            setShareVisible(true);
          }}
          onReposted={() => {
            patchPost(item.id, (p) => ({ ...p, repostedByMe: true }));
          }}
          showDelete={isOwnPost}
          isProfileReel={feedContext === "profile"}
        />
      );
    },
    [
      activeIndex,
      currentUser?.id,
      handleLike,
      handleSave,
      handleAuthorPress,
      handleDelete,
      feedContext,
    ],
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <GestureHandlerRootView style={styles.root}>
      <StatusBar hidden translucent backgroundColor="transparent" />
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[{ flex: 1 }, dismissStyle]}>
          <FlashList
            data={posts}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            pagingEnabled={!isSinglePost}
            showsVerticalScrollIndicator={false}
            decelerationRate="fast"
            initialScrollIndex={isSinglePost ? 0 : startIndex}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig.current}
            onEndReached={loadMore}
            onEndReachedThreshold={0.5}
            removeClippedSubviews
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor="#7C3AED"
                colors={["#7C3AED"]}
                progressBackgroundColor="rgba(0,0,0,0.5)"
              />
            }
          />
        </Animated.View>
      </GestureDetector>

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
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000000" },
});
