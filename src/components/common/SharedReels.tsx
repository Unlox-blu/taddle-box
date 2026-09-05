/**
 * SharedReels — Full-screen reel feed with mixed content types.
 *
 * Mirrors SharedFeed.tsx for the reel presentation.
 * Uses the ContentItem type (same as SharedFeed) and renders through ReelCard dispatcher.
 *
 * Architecture:
 *   - FlashList with pagingEnabled for vertical snap scroll
 *   - Gesture.Pan + Reanimated for swipe-down-to-dismiss & elastic pull-up stretch
 *   - Branded Lottie stretch indicator at bottom footer (springs back on release)
 *   - ReelCard dispatcher for type-specific rendering
 *   - Active content tracking for video preloading
 */
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { View, StyleSheet, Dimensions } from "react-native";
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
import * as Haptics from "expo-haptics";

import ReelCard from "./contentCards/types/ReelCard";
import BrandedLottieLoader from "./BrandedLoader";
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
  openEvents: (id?: string, event?: any) => void;
  feedItems?: any[];
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
  /** Whether more content is available. */
  hasMore?: boolean;
  /** Whether the next page is currently loading. */
  isLoading?: boolean;
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
  hasMore = true,
  isLoading = false,
}: SharedReelsProps) {
  // FlashList ref
  const flashListRef = useRef<FlashListRef<ContentItem>>(null);

  // Keep a ref to the latest onEndReached so the viewability callback
  // never holds a stale closure (onEndReached changes once the session is created).
  const onEndReachedRef = useRef(onEndReached);
  onEndReachedRef.current = onEndReached;

  // Keep a ref to the latest items length so the viewability callback
  // always sees the current list size (not the initial seed count).
  const itemsLengthRef = useRef(items.length);
  itemsLengthRef.current = items.length;

  // Keep a ref to the latest items array for the active-item callback.
  const itemsRef = useRef(items);
  itemsRef.current = items;

  // Keep a ref to the latest onActiveItemChange callback.
  const onActiveItemChangeRef = useRef(onActiveItemChange);
  onActiveItemChangeRef.current = onActiveItemChange;

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

  // ── Swipe-down to dismiss & Bottom stretch ───────────────────────────────
  const dismissY = useSharedValue(0);
  const stretchY = useSharedValue(0);
  const scrollOverscrollY = useSharedValue(0);
  const thresholdHit = useSharedValue(false);
  const isLastReelShared = useSharedValue(
    items.length > 0 && initialIndex >= items.length - 1,
  );
  const isLoadingShared = useSharedValue(isLoading);

  useEffect(() => {
    isLastReelShared.value =
      items.length > 0 && activeIndex >= items.length - 1;
  }, [activeIndex, items.length, isLastReelShared]);

  useEffect(() => {
    isLoadingShared.value = isLoading;
  }, [isLoading, isLoadingShared]);

  const fireHaptic = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, []);

  const handleTriggerLoadMore = useCallback(() => {
    if (hasMore && !isLoading) {
      onEndReachedRef.current?.();
    }
  }, [hasMore, isLoading]);

  // ── Viewability ──────────────────────────────────────────────────────────
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 });
  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (!viewableItems.length) return;
    const newIdx = viewableItems[0].index ?? 0;
    activeIndexRef.current = newIdx;
    setActiveIndex(newIdx);
    isLastReelShared.value =
      itemsLengthRef.current > 0 && newIdx >= itemsLengthRef.current - 1;

    // Notify parent of active item change
    if (onActiveItemChangeRef.current && itemsRef.current[newIdx]) {
      onActiveItemChangeRef.current(itemsRef.current[newIdx], newIdx);
    }

    // Auto-load more when near end
    if (newIdx >= itemsLengthRef.current - 3) {
      onEndReachedRef.current?.();
    }
  }).current;

  // ── Pan Gesture: Dismiss (down) & Stretch Lottie Footer (up) ─────────────
  const panGesture = Gesture.Pan()
    .activeOffsetY(disableSwipeDown ? [-10, 0] : [-10, 10])
    .failOffsetX([-25, 25])
    .onUpdate((e) => {
      // 1. Swipe down: dismiss reel modal
      if (e.translationY > 0 && !disableSwipeDown) {
        dismissY.value = e.translationY * 0.6;
        stretchY.value = 0;
      }
      // 2. Stretch up at the end of reels: elastic rubber-band pull
      else if (e.translationY < 0 && isLastReelShared.value) {
        dismissY.value = 0;
        const offset = -e.translationY;
        const tension = 120;
        const maxStretch = 130;
        stretchY.value = -maxStretch * (1 - Math.exp(-offset / tension));

        // Haptic feedback tick on threshold
        if (stretchY.value < -45 && !thresholdHit.value) {
          thresholdHit.value = true;
          runOnJS(fireHaptic)();
        } else if (stretchY.value >= -45 && thresholdHit.value) {
          thresholdHit.value = false;
        }
      }
    })
    .onEnd((e) => {
      // 1. Handle dismiss
      if (dismissY.value > 0) {
        const shouldDismiss =
          dismissY.value > SCREEN_H * 0.3 ||
          (e.velocityY > 400 && dismissY.value > 40);

        if (shouldDismiss) {
          dismissY.value = withTiming(SCREEN_H * 1.1, { duration: 200 }, () =>
            runOnJS(onDismiss ?? (() => {}))(),
          );
        } else {
          dismissY.value = withSpring(0, { damping: 18, stiffness: 280 });
        }
      }

      // 2. Handle stretch release
      if (stretchY.value < 0) {
        const didCrossThreshold = stretchY.value < -40;
        stretchY.value = withSpring(0, {
          damping: 18,
          stiffness: 220,
          mass: 0.8,
        });
        thresholdHit.value = false;

        if (didCrossThreshold) {
          runOnJS(handleTriggerLoadMore)();
        }
      }
    });

  // Track native iOS scroll bounce overscroll at bottom
  const handleScroll = useCallback(
    (e: any) => {
      const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
      const maxScroll = Math.max(
        0,
        contentSize.height - layoutMeasurement.height,
      );
      if (contentOffset.y > maxScroll + 2) {
        const overscroll = contentOffset.y - maxScroll;
        scrollOverscrollY.value = Math.min(overscroll, 120);
      } else if (scrollOverscrollY.value > 0) {
        scrollOverscrollY.value = 0;
      }
    },
    [scrollOverscrollY],
  );

  const containerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: dismissY.value + stretchY.value }],
    opacity: interpolate(
      dismissY.value,
      [0, SCREEN_H * 0.6],
      [1, 0],
      Extrapolation.CLAMP,
    ),
  }));

  const lottieBubbleAnimatedStyle = useAnimatedStyle(() => {
    const pull = Math.max(-stretchY.value, scrollOverscrollY.value);

    // Height strictly matches the revealed black area at the bottom
    const height = Math.max(0, pull);

    const scale = interpolate(
      pull,
      [0, 15, 60],
      [0, 0.4, 1],
      Extrapolation.CLAMP,
    );

    const opacity = interpolate(
      pull,
      [0, 10, 40],
      [0, 0.5, 1],
      Extrapolation.CLAMP,
    );

    return {
      height,
      opacity,
      transform: [{ scale }],
    };
  });

  // ── Render ───────────────────────────────────────────────────────────────
  const renderItem = useCallback(
    ({ item, index }: { item: ContentItem; index: number }) => {
      return <ReelCard item={item} ctx={reelCtx} index={index} />;
    },
    [reelCtx],
  );

  const keyExtractor = useCallback((item: ContentItem) => item.id, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <GestureDetector gesture={panGesture}>
        <View style={styles.root}>
          <Animated.View style={[{ flex: 1 }, containerAnimatedStyle]}>
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
              onScroll={handleScroll}
              scrollEventThrottle={16}
            />
          </Animated.View>

          {/* Elastic Lottie stretch footer in black area */}
          <Animated.View
            style={[styles.stretchBubbleWrap, lottieBubbleAnimatedStyle]}
            pointerEvents="none"
          >
            <BrandedLottieLoader size={44} />
          </Animated.View>
        </View>
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
  stretchBubbleWrap: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    zIndex: 999,
  },
});
