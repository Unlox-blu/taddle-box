import React, { useState, useRef, useCallback, useEffect } from 'react';
import { FlatList, View, Text, Share, Image, DeviceEventEmitter } from 'react-native';
import { useNavigation, useScrollToTop } from '@react-navigation/native';
import PostCard from '../home/PostCard';
import CommentsModal from '../home/CommentsModal';
import { postsService } from '../../services/posts.service';
import { useAuth } from '../../context/AuthContext';
import type { Post } from '../../types';
import { themedAlert } from './ThemedAlert';
import AppRefreshControl from './AppRefreshControl';

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
  onScroll,
  initialScrollOffset
}: SharedFeedProps) {
  // A string slipped into a List*Component (a caller passing "No posts" as a
  // literal instead of a <View>) would be rendered directly inside a host View
  // and trigger RN's "Text strings must be rendered within a <Text> component"
  // error. Wrapping raw values makes the whole feed class immune.
  const safeNode = (node: React.ReactNode): React.ReactElement | null =>
    typeof node === 'string' || typeof node === 'number' ? (
      <Text>{node}</Text>
    ) : (
      (node as React.ReactElement | null)
    );
  const navigation = useNavigation<any>();
  const { user: currentUser } = useAuth();
  const [activePostId, setActivePostId] = useState<string | null>(null);
  const [commentsVisible, setCommentsVisible] = useState(false);
  const [activeCommentPost, setActiveCommentPost] = useState<Post | null>(null);

  const flatListRef = useRef<any>(null);
  useScrollToTop(flatListRef);

  // A remounted list (profile tab switch back to Posts/Reposts) starts at
  // offset 0 — hop back to the saved position once its first content is in.
  const restoredOffsetRef = useRef(false);
  useEffect(() => {
    if (!initialScrollOffset || restoredOffsetRef.current || posts.length === 0) return;
    restoredOffsetRef.current = true;
    const t = setTimeout(() => {
      flatListRef.current?.scrollToOffset({ offset: initialScrollOffset, animated: false });
    }, 30);
    return () => clearTimeout(t);
  }, [initialScrollOffset, posts.length]);

  React.useEffect(() => {
    const sub = DeviceEventEmitter.addListener('homeDoubleTap', () => {
      flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    });
    return () => sub.remove();
  }, []);

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      const newActiveId = viewableItems[0].item.id;
      setActivePostId((prev) => prev === newActiveId ? prev : newActiveId);
    }
  }).current;

  const handleComment = useCallback((post: Post) => {
    setActiveCommentPost(post);
    setCommentsVisible(true);
  }, []);

  const handleShare = useCallback(async (post: Post) => {
    try {
      const shareTitle = (post as any).title || `${post.author.name}'s Post`;
      const appUrl = `https://taddlebox.com/post/${post.id}`;
      const firstMedia = (post as any).media?.[0]?.url || (post as any).media?.[0]?.cloudfront_url || post.mediaUri;
      
      const message = firstMedia 
        ? `${shareTitle}\n\n${appUrl}\n\nMedia: ${firstMedia}`
        : `${shareTitle}\n\n${appUrl}`;

      await Share.share({
        message,
        url: appUrl, // iOS uses this directly
        title: shareTitle, // Android uses this in the intent
      }, {
        dialogTitle: 'Share Post'
      });
    } catch (e) {
      console.warn("Failed to share", e);
    }
  }, []);

  const handleAuthorPress = useCallback((post: Post) => {
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
  }, [navigation, currentUser?.id]);

  const handleLikeInternal = useCallback(async (id: string) => {
    if (onLike) {
      onLike(id);
    } else if (setPosts) {
      setPosts(prev => prev.map(p => {
        if (p.id !== id) return p;
        const currentLikes = p.likes ?? (p as any).likesCount ?? 0;
        const newLikes = p.isLiked ? Math.max(0, currentLikes - 1) : currentLikes + 1;
        return { ...p, isLiked: !p.isLiked, likes: newLikes, likesCount: newLikes };
      }));
      const post = posts.find(p => p.id === id);
      if (post) {
        await postsService.toggleLike(id, !!post.isLiked).catch(console.error);
      }
    }
  }, [onLike, setPosts, posts]);

  const handleSaveInternal = useCallback(async (id: string) => {
    if (onSave) {
      onSave(id);
    } else if (setPosts) {
      setPosts(prev => prev.map(p => p.id !== id ? p : { ...p, isSaved: !p.isSaved }));
      const post = posts.find(p => p.id === id);
      if (post) {
        await postsService.toggleSave(id, !!post.isSaved).catch(console.error);
      }
    }
  }, [onSave, setPosts, posts]);

  if (!scrollEnabled) {
    return (
      <View style={contentContainerStyle}>
        {safeNode(ListHeaderComponent)}
        {posts.length === 0 ? safeNode(ListEmptyComponent) : posts.map((item, index) => (
          <PostCard
            key={item.id}
            post={item}
            index={index}
            isActive={item.id === activePostId}
            showViews={showViews}
            onAuthorPress={() => handleAuthorPress(item)}
            // Pass the tapped post through — a repost card's embedded original
            // preview calls onComment with the ORIGINAL post so tapping it opens
            // that post's thread, not the repost's.
            onComment={(p) => handleComment((p as Post) ?? item)}
            onShare={() => handleShare(item)}
            onReposted={onReposted}
            onLike={() => handleLikeInternal(item.id)}
            onSave={() => handleSaveInternal(item.id)}
            onDelete={onDelete}
            onReport={onReport || (() => themedAlert('Reported', 'Thank you. This post has been reported for review.'))}
            showDelete={currentUser?.id === (item as any)?.author?.id || currentUser?.id === (item as any)?.author_id || currentUser?.id === (item as any)?.authorId || isAdmin}
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

  const enhancedHeader = (
    <View>
      <View style={{ position: 'absolute', top: -80, left: 0, right: 0, height: 80, alignItems: 'center', justifyContent: 'center' }}>
        <Image 
          source={require('../../../assets/icon.png')} 
          style={{ width: 40, height: 40, borderRadius: 12, opacity: refreshing ? 1 : 0.6 }} 
        />
      </View>
      {safeNode(ListHeaderComponent)}
    </View>
  );

  return (
    <>
      <FlatList
        ref={flatListRef}
        data={posts}
        keyExtractor={item => item.id}
        // Android's default removeClippedSubviews detaches off-screen cards
        // while the feed is being scrolled; when the data array is replaced
        // (refetch) the re-attached cards can render blank/white. Keeping the
        // views mounted avoids that glitch — FlatList still virtualizes.
        removeClippedSubviews={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={contentContainerStyle}
        onScroll={(e) => onScroll?.(e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={16}
        refreshControl={
          <AppRefreshControl
            refreshing={refreshing || false}
            // onRefresh is optional here — AppRefreshControl requires a handler.
            onRefresh={onRefresh || (() => {})}
          />
        }
        // iOS only: without this, a short list (few posts / short bookmarks /
        // profile with a handful of posts) can't be pulled down at all, so the
        // refresh gesture silently does nothing.
        alwaysBounceVertical
        onEndReached={onEndReached}
        onEndReachedThreshold={onEndReachedThreshold || 0.5}
        ListHeaderComponent={enhancedHeader}
        ListEmptyComponent={safeNode(ListEmptyComponent)}
        ListFooterComponent={safeNode(ListFooterComponent)}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        renderItem={({ item, index }) => (
          <PostCard
            post={item}
            index={index}
            isActive={item.id === activePostId}
            showViews={showViews}
            onAuthorPress={() => handleAuthorPress(item)}
            // Pass the tapped post through — a repost card's embedded original
            // preview calls onComment with the ORIGINAL post so tapping it opens
            // that post's thread, not the repost's.
            onComment={(p) => handleComment((p as Post) ?? item)}
            onShare={() => handleShare(item)}
            onReposted={onReposted}
            onLike={() => handleLikeInternal(item.id)}
            onSave={() => handleSaveInternal(item.id)}
            onDelete={onDelete}
            onReport={onReport || (() => themedAlert('Reported', 'Thank you. This post has been reported for review.'))}
            showDelete={currentUser?.id === (item as any)?.author?.id || currentUser?.id === (item as any)?.author_id || currentUser?.id === (item as any)?.authorId || isAdmin}
          />
        )}
      />
      <CommentsModal
        visible={commentsVisible}
        onClose={() => setCommentsVisible(false)}
        post={activeCommentPost}
      />
    </>
  );
}
