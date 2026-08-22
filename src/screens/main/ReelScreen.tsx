/**
 * ReelScreen — Full-screen, paginated, snap-scroll post viewer.
 *
 * Replaces PostDetailScreen. Route name stays "PostDetail" so all existing
 * callers (PostCard, ProfileTabs, NotificationsScreen, etc.) work with zero
 * changes. Callers that have a feed list in scope can pass `feedPosts` to
 * seed the reel with adjacent posts; callers that don't (notifications, deep
 * links) fall back to fetching the global feed in the background.
 */
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  BackHandler,
  Dimensions,
  FlatList,
  StatusBar,
  StyleSheet,
  TouchableOpacity,
  View,
  Text,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useAuth } from '../../context/AuthContext';
import { postsService } from '../../services/posts.service';
import { useReelFeed } from '../../hooks/useReelFeed';
import { fontSizes } from '../../theme';
import type { RootStackParamList, Post } from '../../types';
import ReelItem from './ReelItem';
import CommentsBottomSheet from '../../components/home/CommentsBottomSheet';
import ShareSheet from '../../components/common/ShareSheet';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

type Props = NativeStackScreenProps<RootStackParamList, 'PostDetail'>;

export default function ReelScreen({ navigation, route }: Props) {
  const {
    post: initialPost,
    feedPosts = [],
    feedContext = 'feed',
    feedContextId,
  } = route.params;

  const { user: currentUser } = useAuth();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  // ── Feed list ──────────────────────────────────────────────────────────────
  // Ensure initialPost is always in the list (deep-link entry with no feedPosts)
  const seedPosts = useMemo<Post[]>(() => {
    if (feedPosts.length === 0) return [initialPost];
    const has = feedPosts.some((p) => p.id === initialPost.id);
    return has ? feedPosts : [initialPost, ...feedPosts];
  }, [feedPosts, initialPost]);

  const { posts, startIndex, loadMore, hasMore, patchPost } = useReelFeed({
    initialPosts: seedPosts,
    startPostId: initialPost.id,
    feedContext,
    feedContextId,
  });

  // ── Active index tracking ──────────────────────────────────────────────────
  const [activeIndex, setActiveIndex] = useState(startIndex);
  const activeIndexRef = useRef(activeIndex);
  activeIndexRef.current = activeIndex;

  // ── Index pill fade ────────────────────────────────────────────────────────
  const pillOpacity = useRef(new Animated.Value(0)).current;
  const pillTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showIndexPill = useCallback(() => {
    if (pillTimer.current) clearTimeout(pillTimer.current);
    Animated.timing(pillOpacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    pillTimer.current = setTimeout(() => {
      Animated.timing(pillOpacity, { toValue: 0, duration: 300, useNativeDriver: true }).start();
    }, 2000);
  }, [pillOpacity]);

  // ── Viewability (active post detection) ───────────────────────────────────
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 });
  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (!viewableItems.length) return;
    const newIdx = viewableItems[0].index ?? 0;
    if (newIdx === activeIndexRef.current) return;
    setActiveIndex(newIdx);
    showIndexPill();
    // Record view
    const p = viewableItems[0].item as Post;
    postsService.recordView(p.id).catch(() => {});
    // Load more when 3 posts from end
    if (newIdx >= (viewableItems[0].item ? posts.length - 3 : 0)) {
      loadMore();
    }
  }).current;

  // ── Back handling ──────────────────────────────────────────────────────────
  const handleBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      (navigation as any).reset({
        index: 0,
        routes: [{ name: 'Main', params: { screen: 'Home' } }],
      });
    }
  }, [navigation]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!navigation.canGoBack()) { handleBack(); return true; }
      return false;
    });
    return () => sub.remove();
  }, [handleBack, navigation]);

  // ── Initial view record ────────────────────────────────────────────────────
  useEffect(() => {
    postsService.recordView(initialPost.id).catch(() => {});
  }, [initialPost.id]);

  // ── Cache sync helpers (keep feed / profile / bookmarks in step) ───────────
  const patchCachedPosts = useCallback(
    (postId: string, patch: (p: any) => any) => {
      queryClient.getQueryCache().findAll().forEach((query) => {
        const key = query.queryKey;
        if (!Array.isArray(key) || key.length === 0) return;
        if (!['feed', 'bookmarks', 'profile'].includes(key[0] as string)) return;
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
      queryClient.getQueryCache().findAll().forEach((query) => {
        const key = query.queryKey;
        if (!Array.isArray(key) || key.length === 0) return;
        if (!['feed', 'bookmarks', 'profile'].includes(key[0] as string)) return;
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
      patchPost(postId, (p) => ({ ...p, isLiked: !wasLiked, likes: next, likesCount: next }));
      postsService.toggleLike(postId, wasLiked).catch(() => {
        patchPost(postId, (p) => ({ ...p, isLiked: wasLiked, likes: base, likesCount: base }));
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
      postsService.deletePost(post.id).then(() => {
        removeFromCaches(post.id);
        handleBack();
      }).catch(() => {});
    },
    [removeFromCaches, handleBack],
  );

  const handleAuthorPress = useCallback(
    (post: Post) => {
      (navigation as any).push('UserProfile', {
        user: (post as any).author || {},
      });
    },
    [navigation],
  );

  // ── Comments bottom sheet ──────────────────────────────────────────────────
  const [commentsPost, setCommentsPost] = useState<Post | null>(null);
  const [shareVisible, setShareVisible] = useState(false);
  const [sharePost, setSharePost] = useState<Post | null>(null);

  const handleCountChange = useCallback(
    (postId: string, delta: number) => {
      patchPost(postId, (p) => {
        const base = p.comments ?? (p as any).commentsCount ?? 0;
        const next = Math.max(0, base + delta);
        return { ...p, comments: next, commentsCount: next };
      });
    },
    [patchPost],
  );

  // ── FlatList helpers ───────────────────────────────────────────────────────
  const getItemLayout = useCallback(
    (_: any, index: number) => ({
      length: SCREEN_H,
      offset: SCREEN_H * index,
      index,
    }),
    [],
  );

  const keyExtractor = useCallback((item: Post) => item.id, []);

  const renderItem = useCallback(
    ({ item, index }: { item: Post; index: number }) => {
      const isOwnPost =
        !!currentUser?.id &&
        (item as any)?.author?.id === currentUser.id;
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
          onShare={() => { setSharePost(item); setShareVisible(true); }}
          showDelete={isOwnPost}
        />
      );
    },
    [activeIndex, currentUser?.id, handleLike, handleSave, handleAuthorPress, handleDelete],
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <GestureHandlerRootView style={styles.root}>
      <StatusBar hidden translucent backgroundColor="transparent" />

      <FlatList
        data={posts}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        decelerationRate="fast"
        getItemLayout={getItemLayout}
        initialScrollIndex={startIndex}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig.current}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        removeClippedSubviews
        windowSize={5}
        maxToRenderPerBatch={3}
        initialNumToRender={2}
      />

      {/* Back button — always visible, absolute top-left */}
      <TouchableOpacity
        style={[styles.backBtn, { top: insets.top + 12 }]}
        onPress={handleBack}
        hitSlop={12}
      >
        <Ionicons name="arrow-back" size={24} color="#fff" />
      </TouchableOpacity>

      {/* Index pill — fades in on scroll, auto-hides after 2 s */}
      <Animated.View
        style={[styles.indexPill, { top: insets.top + 14, opacity: pillOpacity }]}
        pointerEvents="none"
      >
        <Text style={styles.indexPillText}>
          {activeIndex + 1} / {posts.length}
        </Text>
      </Animated.View>

      {/* Comments bottom sheet */}
      <CommentsBottomSheet
        post={commentsPost}
        onClose={() => setCommentsPost(null)}
        onCountChange={handleCountChange}
      />

      <ShareSheet
        visible={shareVisible}
        onClose={() => setShareVisible(false)}
        postId={sharePost?.id || ""}
        postTitle={(sharePost as any)?.title || sharePost?.content?.slice(0, 80)}
      />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  backBtn: {
    position: 'absolute',
    left: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.40)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  indexPill: {
    position: 'absolute',
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  indexPillText: {
    fontSize: fontSizes.xs,
    fontWeight: '700',
    color: '#fff',
  },
});
