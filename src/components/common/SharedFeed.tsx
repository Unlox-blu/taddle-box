import React, { useState, useRef, useCallback } from 'react';
import { FlatList, View, Share, Image, RefreshControl, DeviceEventEmitter } from 'react-native';
import { useNavigation, useScrollToTop } from '@react-navigation/native';
import PostCard from '../home/PostCard';
import CommentsModal from '../home/CommentsModal';
import { postsService } from '../../services/posts.service';
import { useAuth } from '../../context/AuthContext';
import type { Post } from '../../types';

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
  isAdmin?: boolean;
  ListHeaderComponent?: React.ReactElement | null;
  ListEmptyComponent?: React.ReactElement | null;
  ListFooterComponent?: React.ReactElement | null;
  scrollEnabled?: boolean;
  contentContainerStyle?: any;
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
  isAdmin,
  ListHeaderComponent,
  ListEmptyComponent,
  ListFooterComponent,
  scrollEnabled = true,
  contentContainerStyle
}: SharedFeedProps) {
  const navigation = useNavigation<any>();
  const { user: currentUser } = useAuth();
  const [activePostId, setActivePostId] = useState<string | null>(null);
  const [commentsVisible, setCommentsVisible] = useState(false);
  const [activeCommentPost, setActiveCommentPost] = useState<Post | null>(null);

  const flatListRef = useRef<any>(null);
  useScrollToTop(flatListRef);

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
        navigation.navigate("UserProfile", { user: post.author });
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
        {ListHeaderComponent}
        {posts.length === 0 ? ListEmptyComponent : posts.map((item, index) => (
          <PostCard
            key={item.id}
            post={item}
            index={index}
            isActive={item.id === activePostId}
            onAuthorPress={() => handleAuthorPress(item)}
            onComment={() => handleComment(item)}
            onShare={() => handleShare(item)}
            onLike={() => handleLikeInternal(item.id)}
            onSave={() => handleSaveInternal(item.id)}
          />
        ))}
        {ListFooterComponent}
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
      {ListHeaderComponent}
    </View>
  );

  return (
    <>
      <FlatList
        ref={flatListRef}
        data={posts}
        keyExtractor={item => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={contentContainerStyle}
        refreshControl={
          <RefreshControl
            refreshing={refreshing || false}
            onRefresh={onRefresh}
            tintColor="transparent"
            colors={["#7C3AED"]}
          />
        }
        onEndReached={onEndReached}
        onEndReachedThreshold={onEndReachedThreshold || 0.5}
        ListHeaderComponent={enhancedHeader}
        ListEmptyComponent={ListEmptyComponent}
        ListFooterComponent={ListFooterComponent}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        renderItem={({ item, index }) => (
          <PostCard
            post={item}
            index={index}
            isActive={item.id === activePostId}
            onAuthorPress={() => handleAuthorPress(item)}
            onComment={() => handleComment(item)}
            onShare={() => handleShare(item)}
            onLike={() => handleLikeInternal(item.id)}
            onSave={() => handleSaveInternal(item.id)}
            onDelete={onDelete}
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
