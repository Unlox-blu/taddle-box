import React, { useState, useRef, useCallback, useMemo, useEffect } from "react";
import {
  View,
  Text,
  DeviceEventEmitter,
  Animated,
  Dimensions,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import {
  useIsFocused,
  useNavigation,
  useScrollToTop,
} from "@react-navigation/native";
import PostCard from "./contentCards/types/postCard/PostCard";
import CommentsModal from "../home/CommentsModal";
import { postsService } from "../../services/posts.service";
import { useAuth } from "../../context/AuthContext";
import type { Post } from "../../types";
import { themedAlert } from "./ThemedAlert";
import PullToRefreshWrapper from "./PullToRefreshWrapper";
import ShareSheet from "./ShareSheet";
import { useGlobalScroll } from "../../context/ScrollContext";
import { useActiveContentTracker } from "../../hooks/useActiveContentTracker";
import { resolveContentId } from "../../utils/content.util";
import FeedCard from "./contentCards/FeedCard";
import type { FeedCtx, ContentItem } from "./contentCards/content";
import { createRowStyles } from "./rowStyles";
import { useThemeColors } from "../../context/ThemeContext";



interface SharedFeedProps {
  items: ContentItem[];
  onLike?: (id: string) => void;
  onSave?: (id: string) => void;
  refreshing?: boolean;
  onRefresh?: () => void;
  onEndReached?: () => void;
  onEndReachedThreshold?: number;
  onDelete?: (post: Post) => void;
  onReport?: (post: Post) => void;
  /** Called after a repost so the screen can refresh its feed. */
  onReposted?: (post: any) => void;
  isAdmin?: boolean;
  /** Show the view count on each post (profile page only). */
  showViews?: boolean;
  ListHeaderComponent?: React.ReactElement | null;
  ListEmptyComponent?: React.ReactElement | null;
  ListFooterComponent?: React.ReactElement | null;
  scrollEnabled?: boolean;
  contentContainerStyle?: any;
  /** Precise height of the spotlight/hero section inside the ListHeaderComponent, used for active post cutoff. */
  spotlightBoundary?: number;
  /** Pinned section chrome (a screen's title + filter pills) that hides and
      shows IN LOCKSTEP with the main header when scrolling — forwarded to
      PullToRefreshWrapper. See its `sectionHeader` prop. */
  sectionHeader?: React.ReactNode;
  /** Height estimate for sectionHeader (refined by onLayout). */
  sectionHeaderH?: number;
  /** Reports the list's current vertical scroll offset (the profile uses it to
      preserve scroll position across Posts/Reposts/Mentions tab switches). */
  onScroll?: (offsetY: number) => void;
  /** Scroll the list to this offset once, after its first content arrives — a
      freshly remounted list starts at 0, and this puts it back where the user
      was (e.g. switching back to the Posts tab from Mentions). */
  initialScrollOffset?: number;
  /** Adjacent posts to seed the reel when a card is tapped. Pass the full
   *  current post list so the reel can continue from the tapped position. */
  feedPosts?: Post[];
  feedContext?: 'home' | 'profile' | 'bookmarks' | 'community' | 'search';
  feedContextId?: string;
}

export default function SharedFeed({
  items,
  onLike,
  onSave,
  refreshing,
  onRefresh,
  onEndReached,
  onEndReachedThreshold,
  onDelete,
  onReport,
  onReposted,
  isAdmin,
  showViews,
  ListHeaderComponent,
  ListEmptyComponent,
  ListFooterComponent,
  scrollEnabled = true,
  contentContainerStyle,
  spotlightBoundary,
  sectionHeader,
  sectionHeaderH,
  onScroll,
  initialScrollOffset,
  feedPosts,
  feedContext,
  feedContextId,
}: SharedFeedProps) {
  // A string slipped into a List*Component (a caller passing "No posts" as a
  // literal instead of a <View>) would be rendered directly inside a host View
  // and trigger RN's "Text strings must be rendered within a <Text> component"
  // error. Wrapping raw values makes the whole feed class immune.
  const safeNode = (node: React.ReactNode): React.ReactElement | null =>
    typeof node === "string" || typeof node === "number" ? (
      <Text>{node}</Text>
    ) : (
      (node as React.ReactElement | null)
    );
  const navigation = useNavigation<any>();
  const isFocused = useIsFocused();
  const { user: currentUser } = useAuth();
  const { headerHeight, footerHeight } = useGlobalScroll();

  const [listHeaderOffset, setListHeaderOffset] = useState(0);

  // ── Derive posts-only list from rows for active tracking / preload ──────────
  const posts = useMemo(
    () =>
      items
        .filter((r) => r.itemType === "post" || r.itemType === "poll")
        .map((r) => r.data as Post),
    [items],
  );

  // ── Active-content tracking (hybrid: viewability filter + layout.y + hysteresis) ─
  const {
    activeContentId,
    viewabilityConfig,
    onViewableItemsChanged,
    trackLayout,
    handleScroll: handleScrollForTracking,
  } = useActiveContentTracker(items, {
    listHeaderOffset,
    // PullToRefreshWrapper overrides contentContainerStyle.paddingTop to
    // (headerHeight + sectionH) when a sectionHeader is present — the tracker
    // must use the same combined value so scroll-coords stay in sync.
    // The debug zone, tracking math, and content layout all use this value.
    headerHeight: headerHeight + (sectionHeaderH || 0),
    spotlightBoundary,
    // FlashList's data is ContentItem[], so viewability items arrive as
    // { type, item } wrappers. Unwrap to get the real content ID.
    getContentId: (feedItem: any) => {
      const inner = feedItem?.item ?? feedItem;
      const id = inner._trackId || inner.data?.id || resolveContentId(inner);
      return id || null;
    },
  });

  // ── Instant view count: record server-side view the moment a post enters
  // the viewport. Each post fires at most once per mount (deduped by Set).
  // This is separate from the XP pill — XP needs dwell time, view count
  // is just "this post was seen".
  const viewedPostIdsRef = useRef(new Set<string>());
  useEffect(() => {
    if (!activeContentId || viewedPostIdsRef.current.has(activeContentId) || activeContentId.startsWith("__row_")) return;
    viewedPostIdsRef.current.add(activeContentId);
    postsService.recordView(activeContentId).catch(() => {});
  }, [activeContentId]);

  const [commentsVisible, setCommentsVisible] = useState(false);
  const [activeCommentPost, setActiveCommentPost] = useState<Post | null>(null);
  const [shareVisible, setShareVisible] = useState(false);
  const [sharePost, setSharePost] = useState<Post | null>(null);

  const flatListRef = useRef<any>(null);
  useScrollToTop(flatListRef);

  // Home-style tab-bar behavior: single-tap scrolls to top, double-tap also
  // scrolls to top (the refresh for double-tap is handled by the owning
  // screen — HomeScreen / SharedProfile). This SharedFeed powers the Home,
  // Profile and Bookmarks feeds, so it listens for all three screens' events.
  //
  // Like PullToRefreshWrapper's triggerPullRefresh handling, these listeners
  // are FOCUS-GUARDED: every tab stays mounted (and Bookmarks is pushed over
  // the Home stack), so several feeds hear the same events at once — only
  // the FOCUSED feed may react. The triggerPullRefresh listener scrolls the
  // visible feed to the top on a programmatic refresh (tab-bar double-tap on
  // the active tab) while the wrapper drops the bubble.
  const isFocusedRef = useRef(false);
  isFocusedRef.current = isFocused;
  React.useEffect(() => {
    const scrollToTop = () => {
      if (!isFocusedRef.current) return;
      flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    };
    const events = ["homeSingleTap", "profileSingleTap", "profileDoubleTap"];
    const subs = [
      ...events.map((name) =>
        DeviceEventEmitter.addListener(name, scrollToTop),
      ),
      DeviceEventEmitter.addListener("triggerPullRefresh", scrollToTop),
    ];
    return () => subs.forEach((s) => s.remove());
  }, []);

  // ── Video preload: direction-aware ─────────────────────────────────
  const lastScrollYRef = useRef(0);
  const scrollDirRef = useRef<1 | -1>(1); // 1=down, -1=up

  const scrollYAnim = useRef(new Animated.Value(0)).current;  const preloadPostId = useMemo(() => {
    if (!activeContentId) return null;
    const activeIdx = posts.findIndex((p) => p.id === activeContentId);
    if (activeIdx < 0) return null;

    const dir = scrollDirRef.current;
    if (dir === 1) {
      for (let i = activeIdx + 1; i < posts.length; i++) {
        const p = posts[i] as any;
        const media = p.media || [];
        if (media.some((m: any) => m.media_type === "video")) return p.id;
      }
    } else {
      for (let i = activeIdx - 1; i >= 0; i--) {
        const p = posts[i] as any;
        const media = p.media || [];
        if (media.some((m: any) => m.media_type === "video")) return p.id;
      }
    }
    // Fallback: try the other direction
    for (let i = activeIdx + 1; i < posts.length; i++) {
      const p = posts[i] as any;
      const media = p.media || [];
      if (media.some((m: any) => m.media_type === "video")) return p.id;
    }
    return null;
  }, [posts, activeContentId]);

  const handleComment = useCallback((post: Post) => {
    setActiveCommentPost(post);
    setCommentsVisible(true);
  }, []);

  const handleShare = useCallback((post: Post) => {
    setSharePost(post);
    setShareVisible(true);
  }, []);

  const handleAuthorPress = useCallback(
    (post: Post) => {
      if (post.author) {
        if (currentUser?.id && post.author.id === currentUser.id) {
          navigation.navigate("Profile");
        } else {
          navigation.push("UserProfile", { user: post.author });
        }
      }
    },
    [navigation, currentUser?.id],
  );

  const handleLikeInternal = useCallback(
    async (id: string) => {
      if (onLike) {
        onLike(id);
      }
    },
    [onLike],
  );

  const handleSaveInternal = useCallback(
    async (id: string) => {
      if (onSave) {
        onSave(id);
      }
    },
    [onSave],
  );

  // ── Shared show-delete check ───────────────────────────────────────
  const canDelete = useCallback(
    (item: Post) =>
      currentUser?.id === (item as any)?.author?.id ||
      currentUser?.id === (item as any)?.author_id ||
      currentUser?.id === (item as any)?.authorId ||
      isAdmin,
    [currentUser?.id, isAdmin],
  );

  // ── Row styles + context for non-post ROW_RENDERERS ──────────────
  const colors = useThemeColors();
  const rowStyles = useMemo(() => createRowStyles(colors), [colors]);

  const feedCtx: FeedCtx = useMemo(
    () => ({
      styles: rowStyles as any,
      colors,
      navigation,
      isFocused,
      activeContentId,
      currentUserId: currentUser?.id,
      toggleLike: (id) => handleLikeInternal(id),
      toggleSave: (id) => handleSaveInternal(id),
      patchPost: () => {},
      sharePost: (post) => handleShare(post),
      reportPost: () => {},
      refresh: () => onRefresh?.(),
      openPost: (post) => navigation.push("PostDetail", { post }),
      openComments: (post) => handleComment(post),
      openUser: (user) => {
        if (currentUser?.id && user?.id === currentUser.id) {
          navigation.navigate("Profile");
        } else {
          navigation.push("UserProfile", { user });
        }
      },
      openCommunity: (slug) => navigation.push("CommunityDetail", { communitySlug: slug }),
      openGames: (id?: string) => {
        if (id) {
          navigation.navigate("Games", { openGameId: id, autoPlay: true });
        } else {
          navigation.navigate("Games");
        }
      },
      openEvents: (id?: string) => {
        if (id) {
          navigation.push("EventDetail", { eventId: id });
        } else {
          navigation.push("Events");
        }
      },
      openSettings: () => navigation.push("Settings"),
      openNotifications: () => {},
      addHashtag: (tag) => navigation.push("Search", { query: tag }),
      trackLayout,
      preloadPostId,
      feedPosts: feedPosts ?? posts,
      feedContext,
      feedContextId,
    }),
    [
      rowStyles, colors, navigation, isFocused, activeContentId,
      currentUser?.id, handleLikeInternal, handleSaveInternal,
      handleShare, handleComment, onRefresh, trackLayout,
      preloadPostId, feedPosts, posts, feedContext, feedContextId,
    ],
  );

  // ── Render a single row through the type dispatcher ────────────────
  const renderRow = useCallback(
    (row: ContentItem, index: number) => {
      // Header rows render nothing (zero-height section dividers)
      if (row.isHeader) return null;

      // Delegate ALL content rendering to FeedCard
      // which acts as the SSOT dispatcher for the envelope architecture.
      return <FeedCard item={row} ctx={feedCtx} index={index} />;
    },
    [
      isFocused,
      activeContentId,
      showViews,
      handleAuthorPress,
      handleComment,
      handleShare,
      onReposted,
      handleLikeInternal,
      handleSaveInternal,
      onDelete,
      onReport,
      canDelete,
      preloadPostId,
      feedPosts,
      posts,
      feedContext,
      feedContextId,
    ],
  );

  // ── Row key extractor ──────────────────────────────────────────────
  const rowKeyExtractor = useCallback(
    (row: ContentItem, index: number) =>
      row.id || resolveContentId(row.data) || `row-${index}`,
    [],
  );

  if (!scrollEnabled) {
    return (
      <View
        style={[
          { paddingTop: headerHeight, paddingBottom: footerHeight },
          contentContainerStyle,
        ]}
      >
        {safeNode(ListHeaderComponent)}
        {items.length === 0
          ? safeNode(ListEmptyComponent)
          : items.map((row, index) => (
              <View key={rowKeyExtractor(row, index)}>
                {renderRow(row, index)}
              </View>
            ))}
        {safeNode(ListFooterComponent)}
        <CommentsModal
          visible={commentsVisible}
          onClose={() => setCommentsVisible(false)}
          post={activeCommentPost}
        />
      </View>
    );
  }

  const enhancedHeader = safeNode(ListHeaderComponent);

  return (
    <>
      <PullToRefreshWrapper
        refreshing={refreshing ?? false}
        onRefresh={onRefresh || (() => {})}
        sectionHeader={sectionHeader}
        sectionHeaderH={sectionHeaderH}
      >
        <FlashList
          ref={flatListRef}
          data={items}
          extraData={feedCtx}
          keyExtractor={rowKeyExtractor}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            { paddingTop: headerHeight, paddingBottom: footerHeight + Dimensions.get("window").height * 0.5 },
            contentContainerStyle,
          ]}
          contentOffset={
            initialScrollOffset ? { x: 0, y: initialScrollOffset } : undefined
          }
          onScroll={(e) => {
            const y = e.nativeEvent.contentOffset.y;
            scrollYAnim.setValue(y);
            if (y > lastScrollYRef.current + 2) scrollDirRef.current = 1;
            else if (y < lastScrollYRef.current - 2) scrollDirRef.current = -1;
            lastScrollYRef.current = y;
            onScroll?.(y);
            handleScrollForTracking(e);
          }}
          scrollEventThrottle={16}
          alwaysBounceVertical
          onEndReached={onEndReached}
          onEndReachedThreshold={onEndReachedThreshold || 0.5}
          viewabilityConfig={viewabilityConfig}
          onViewableItemsChanged={onViewableItemsChanged}
          ListHeaderComponent={
            enhancedHeader ? (
              <View
                onLayout={(e) =>
                  setListHeaderOffset(e.nativeEvent.layout.height)
                }
              >
                {enhancedHeader}
              </View>
            ) : undefined
          }
          ListEmptyComponent={safeNode(ListEmptyComponent)}
          ListFooterComponent={safeNode(ListFooterComponent)}
          renderItem={({ item: row, index }) => (
            <View
              onLayout={(e) => {
                // Only track layout for post rows (active-post tracker only
                // cares about posts; other types return null ID).
                const id = (row as any)._trackId || row.data?.id || resolveContentId(row);
                const trackId = id || `non-trackable-${index}`;
                const { y, height } = e.nativeEvent.layout;
                trackLayout(trackId, { top: y, bottom: y + height });
              }}
            >
              {renderRow(row, index)}
            </View>
          )}
        />
      </PullToRefreshWrapper>

      <CommentsModal
        visible={commentsVisible}
        onClose={() => setCommentsVisible(false)}
        post={activeCommentPost}
      />

      <ShareSheet
        visible={shareVisible}
        onClose={() => setShareVisible(false)}
        postId={sharePost?.id || ""}
        postTitle={(sharePost as any)?.title || sharePost?.content?.slice(0, 80)}
      />


    </>
  );
}
