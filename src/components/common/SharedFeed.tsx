import React, { useState, useRef, useCallback, useMemo } from "react";
import {
  View,
  Text,
  Share,
  DeviceEventEmitter,
  Dimensions,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import {
  useIsFocused,
  useNavigation,
  useScrollToTop,
} from "@react-navigation/native";
import PostCard from "../home/PostCard";
import CommentsModal from "../home/CommentsModal";
import { postsService } from "../../services/posts.service";
import { useAuth } from "../../context/AuthContext";
import type { Post } from "../../types";
import { themedAlert } from "./ThemedAlert";
import PullToRefreshWrapper from "./PullToRefreshWrapper";
import { useGlobalScroll } from "../../context/ScrollContext";
import { useActivePostTracking } from "../../hooks/useActivePostTracking";

interface SharedFeedProps {
  posts: Post[];
  setPosts?: React.Dispatch<React.SetStateAction<Post[]>>;
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
}

export default function SharedFeed({
  posts,
  setPosts,
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

  // ── Active-post tracking (hybrid: viewability filter + layout.y + hysteresis) ─
  const {
    activePostId,
    viewabilityConfig,
    onViewableItemsChanged,
    trackLayout,
    handleScroll: handleScrollForTracking,
  } = useActivePostTracking(posts, { listHeaderOffset, headerHeight, spotlightBoundary });

  const [commentsVisible, setCommentsVisible] = useState(false);
  const [activeCommentPost, setActiveCommentPost] = useState<Post | null>(null);

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

  // ── Video preload: find the next video post after active ────────────────
  // Only 1 video ahead gets preloaded. When the user scrolls to it,
  // it plays immediately. This keeps 1 active + 1 preloaded = ~2 players max.
  const preloadPostId = useMemo(() => {
    if (!activePostId) return null;
    const activeIdx = posts.findIndex((p) => p.id === activePostId);
    if (activeIdx < 0) return null;

    // Look ahead from active+1 for the next video post
    for (let i = activeIdx + 1; i < posts.length; i++) {
      const p = posts[i] as any;
      const media = p.media || [];
      const hasVideo = media.some(
        (m: any) => m.media_type === "video" || m.type === "video",
      );
      if (hasVideo) return p.id;
    }
    return null;
  }, [posts, activePostId]);

  const handleComment = useCallback((post: Post) => {
    setActiveCommentPost(post);
    setCommentsVisible(true);
  }, []);

  const handleShare = useCallback(async (post: Post) => {
    try {
      const shareTitle = (post as any).title || `${post.author.name}'s Post`;
      const appUrl = `https://taddlebox.com/post/${post.id}`;
      const firstMedia = (post as any).media?.[0]?.media_url || post.mediaUri;

      const message = firstMedia
        ? `${shareTitle}\n\n${appUrl}\n\nMedia: ${firstMedia}`
        : `${shareTitle}\n\n${appUrl}`;

      await Share.share(
        {
          message,
          url: appUrl, // iOS uses this directly
          title: shareTitle, // Android uses this in the intent
        },
        {
          dialogTitle: "Share Post",
        },
      );
    } catch (e) {
      console.warn("Failed to share", e);
    }
  }, []);

  const handleAuthorPress = useCallback(
    (post: Post) => {
      if (post.author) {
        if (currentUser?.id && post.author.id === currentUser.id) {
          navigation.navigate("Profile");
        } else {
          // push (not navigate): from a profile grid opened off a detail page a
          // UserProfile may already be in the stack — navigate would pop back to
          // it and skip the screens in between.
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
      } else if (setPosts) {
        setPosts((prev) =>
          prev.map((p) => {
            if (p.id !== id) return p;
            const currentLikes = p.likes ?? (p as any).likesCount ?? 0;
            const newLikes = p.isLiked
              ? Math.max(0, currentLikes - 1)
              : currentLikes + 1;
            return {
              ...p,
              isLiked: !p.isLiked,
              likes: newLikes,
              likesCount: newLikes,
            };
          }),
        );
        const post = posts.find((p) => p.id === id);
        if (post) {
          await postsService
            .toggleLike(id, !!post.isLiked)
            .catch(console.error);
        }
      }
    },
    [onLike, setPosts, posts],
  );

  const handleSaveInternal = useCallback(
    async (id: string) => {
      if (onSave) {
        onSave(id);
      } else if (setPosts) {
        setPosts((prev) =>
          prev.map((p) => (p.id !== id ? p : { ...p, isSaved: !p.isSaved })),
        );
        const post = posts.find((p) => p.id === id);
        if (post) {
          await postsService
            .toggleSave(id, !!post.isSaved)
            .catch(console.error);
        }
      }
    },
    [onSave, setPosts, posts],
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
        {posts.length === 0
          ? safeNode(ListEmptyComponent)
          : posts.map((item, index) => (
              <PostCard
                key={item.id}
                post={item}
                index={index}
                isActive={isFocused && item.id === activePostId}
                showViews={showViews}
                onAuthorPress={handleAuthorPress}
                onComment={handleComment}
                onShare={handleShare}
                onReposted={onReposted}
                onLike={handleLikeInternal}
                onSave={handleSaveInternal}
                onDelete={onDelete}
                onReport={
                  onReport ||
                  (() =>
                    themedAlert(
                      "Reported",
                      "Thank you. This post has been reported for review.",
                    ))
                }
                showDelete={
                  currentUser?.id === (item as any)?.author?.id ||
                  currentUser?.id === (item as any)?.author_id ||
                  currentUser?.id === (item as any)?.authorId ||
                  isAdmin
                }
              />
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

  // The old static pull icon (an app logo floating above the list) is gone:
  // PullToRefreshWrapper renders its own Lottie bubble, so a second logo here
  // would float under the header and double up during pull-to-refresh.
  const enhancedHeader = safeNode(ListHeaderComponent);

  return (
    <>
      <PullToRefreshWrapper
        refreshing={refreshing || false}
        onRefresh={onRefresh || (() => {})}
        sectionHeader={sectionHeader}
        sectionHeaderH={sectionHeaderH}
      >
        <FlashList
          ref={flatListRef}
          data={posts}
          keyExtractor={(item) => item.id}
          // FlashList handles view recycling internally — no need for
          // removeClippedSubviews workaround.
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="on-drag"
          contentContainerStyle={[
            { paddingTop: headerHeight, paddingBottom: footerHeight },
            contentContainerStyle,
          ]}
          contentOffset={
            initialScrollOffset ? { x: 0, y: initialScrollOffset } : undefined
          }
          onScroll={(e) => {
            onScroll?.(e.nativeEvent.contentOffset.y);
            handleScrollForTracking(e);
          }}
          scrollEventThrottle={16}
          // iOS only: without this, a short list (few posts / short bookmarks /
          // profile with a handful of posts) can't be pulled down at all, so the
          // refresh gesture silently does nothing.
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
          renderItem={({ item, index }) => (
            <View
              onLayout={(e) => {
                const { y, height } = e.nativeEvent.layout;
                trackLayout(item.id, { top: y, bottom: y + height });
              }}
            >
              <PostCard
                post={item}
                index={index}
                isActive={isFocused && item.id === activePostId}
                showViews={showViews}
                onAuthorPress={handleAuthorPress}
                onComment={handleComment}
                onShare={handleShare}
                onReposted={onReposted}
                onLike={handleLikeInternal}
                onSave={handleSaveInternal}
                onDelete={onDelete}
                onReport={
                  onReport ||
                  (() =>
                    themedAlert(
                      "Reported",
                      "Thank you. This post has been reported for review.",
                    ))
                }
                showDelete={
                  currentUser?.id === (item as any)?.author?.id ||
                  currentUser?.id === (item as any)?.author_id ||
                  currentUser?.id === (item as any)?.authorId ||
                  isAdmin
                }
                preloadVideo={item.id === preloadPostId}
              />
            </View>
          )}
        />
      </PullToRefreshWrapper>

      {/* Debug Overlay: 35% Focus Zone */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: Dimensions.get("window").height * ((1 - 0.35) / 2),
          height: Dimensions.get("window").height * 0.35,
          left: 0,
          right: 0,
          backgroundColor: "rgba(0, 0, 0, 0.2)",
          borderTopWidth: 1,
          borderBottomWidth: 1,
          borderColor: "rgba(255, 255, 255, 0.5)",
          zIndex: 9999,
        }}
      />

      <CommentsModal
        visible={commentsVisible}
        onClose={() => setCommentsVisible(false)}
        post={activeCommentPost}
      />
    </>
  );
}
