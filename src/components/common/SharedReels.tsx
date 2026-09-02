/**
 * SharedReels — Full-screen reel feed with mixed content types.
 *
 * Mirrors SharedFeed.tsx for the reel presentation.
 * Uses the ContentItem type (same as SharedFeed) and renders through ReelCard dispatcher.
 *
 * Architecture:
 *   - FlashList with pagingEnabled for vertical snap scroll
 *   - Gesture.Pan + Reanimated for swipe-down-to-dismiss
 *   - ReelCard dispatcher for type-specific rendering
 *   - Active content tracking for video preloading
 *
 * Usage:
 *   <SharedReels
 *     items={feedRows}
 *     reelCtx={reelCtx}
 *     initialIndex={startIndex}
 *     onEndReached={loadMore}
 *     ...
 *   />
 */
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  View,
  StyleSheet,
  Dimensions,
} from "react-native";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
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

import ReelCard from "./contentCards/types/ReelCard";
import { useReelPreloader } from "../../hooks/useReelPreloader";
import type { Post } from "../../types";
import type { ContentItem } from "./contentCards/content";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

// ── Reel Context (mirrors FeedCtx from SharedFeed) ────────────────────────────

export type ReelCtx = {
  activeContentId: string | null;
  toggleLike: (id: string, isLiked: boolean) => void;
  toggleSave: (id: string, isSaved: boolean) => void;
  sharePost: (post: any) => void;
  openPost: (post: any) => void;
  openComments: (post: any) => void;
  openUser: (user: any) => void;
  openCommunity: (slug: string) => void;
  openGames: (id?: string) => void;
  openEvents: (id?: string) => void;
  feedPosts?: any[];
  feedContext?: string;
  feedContextId?: string;
};

// ── Props ────────────────────────────────────────────────────────────────────

interface SharedReelsProps {
  /** Rows of content to display (ContentItem from content). */
  items: ContentItem[];
  /** The reel context with handlers and state. */
  reelCtx: ReelCtx;
  /** Starting scroll index. */
  initialIndex: number;
  /** Called when the user approaches the end (pagination). */
  onEndReached?: () => void;
  /** Whether to disable swipe-down (e.g. single-post mode). */
  disableSwipeDown?: boolean;
  /** Callback for swipe-down dismiss. */
  onDismiss?: () => void;
  /** View tracking callback. */
  onActiveItemChange?: (item: ContentItem, index: number) => void;
}

// ── SharedReels Component ────────────────────────────────────────────────────

export default function SharedReels({
  items,
  reelCtx,
  initialIndex,
  onEndReached,
  disableSwipeDown = false,
  onDismiss,
  onActiveItemChange,
}: SharedReelsProps) {
  // FlashList ref
  const flashListRef = useRef<FlashListRef<ContentItem>>(null);

  // Active index for video preloading
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const activeIndexRef = useRef(activeIndex);
  activeIndexRef.current = activeIndex;

  // Extract posts from items for video preloading
  const postsForPreload = useMemo(() => {
    return items
      .filter((r) => r.itemType === "post" || r.itemType === "poll")
      .map((r) => r.data as Post);
  }, [items]);

  // Video preloading
  useReelPreloader({
    posts: postsForPreload,
    activeIndex,
    preloadCount: 2,
  });

  // ── Viewability ──────────────────────────────────────────────────────────
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 });
  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (!viewableItems.length) return;
    const newIdx = viewableItems[0].index ?? 0;
    activeIndexRef.current = newIdx;
    setActiveIndex(newIdx);

    // Notify parent of active item change
    if (onActiveItemChange && items[newIdx]) {
      onActiveItemChange(items[newIdx], newIdx);
    }

    // Auto-load more when near end
    if (newIdx >= items.length - 3) {
      onEndReached?.();
    }
  }).current;

  // ── Swipe-down to dismiss ────────────────────────────────────────────────
  const dismissY = useSharedValue(0);

  const panGesture = disableSwipeDown
    ? Gesture.Pan().enabled(false)
    : Gesture.Pan()
        .activeOffsetY(10)
        .onUpdate((e) => {
          if (e.translationY > 0) {
            dismissY.value = e.translationY * 0.6;
          }
        })
        .onEnd((e) => {
          const shouldDismiss =
            dismissY.value > SCREEN_H * 0.3 ||
            (e.velocityY > 400 && dismissY.value > 40);

          if (shouldDismiss) {
            dismissY.value = withTiming(
              SCREEN_H * 1.1,
              { duration: 200 },
              () => runOnJS(onDismiss ?? (() => {}))()
            );
          } else {
            dismissY.value = withSpring(0, { damping: 18, stiffness: 280 });
          }
        });

  const dismissStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: dismissY.value }],
    opacity: interpolate(
      dismissY.value,
      [0, SCREEN_H * 0.6],
      [1, 0],
      Extrapolation.CLAMP
    ),
  }));

  // ── Render ───────────────────────────────────────────────────────────────
  const renderItem = useCallback(
    ({ item, index }: { item: ContentItem; index: number }) => {
      return (
        <ReelCard
          item={item}
          ctx={reelCtx}
          index={index}
        />
      );
    },
    [reelCtx]
  );

  const keyExtractor = useCallback((item: ContentItem) => item.id, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[{ flex: 1 }, dismissStyle]}>
          <FlashList
            ref={flashListRef}
            data={items}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            pagingEnabled
            showsVerticalScrollIndicator={false}
            decelerationRate="fast"
            initialScrollIndex={initialIndex}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig.current}
            onEndReached={onEndReached}
            onEndReachedThreshold={0.5}
          />
        </Animated.View>
      </GestureDetector>
    </GestureHandlerRootView>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000",
  },
});
