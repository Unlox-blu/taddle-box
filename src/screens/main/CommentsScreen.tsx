import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, Image,
  StyleSheet, KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { fontSizes, spacing, radii, type ColorPalette } from '../../theme';
import { useTheme, useThemeColors } from '../../context/ThemeContext';
import type { HomeStackParamList } from '../../types';
import { useAuth } from '../../context/AuthContext';
import SmartInput from '../../components/common/SmartInput';
import { commentService, Comment } from '../../services/comment.service';
import { usePosts } from '../../context/PostsContext';
import { useQueryClient } from '@tanstack/react-query';
import PresenceDot from '../../components/common/PresenceDot';
import { postsService } from '../../services/posts.service';

type Props = NativeStackScreenProps<HomeStackParamList, 'Comments'>;

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg.base },

    header: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: spacing.lg, paddingVertical: 12,
      borderBottomWidth: 1, borderBottomColor: c.border,
    },
    backBtn: {
      width: 36, height: 36, borderRadius: 18,
      alignItems: 'center', justifyContent: 'center', marginRight: 4,
    },
    headerCenter: { flex: 1 },
    title:    { fontSize: fontSizes.lg, fontWeight: '800', color: c.text.primary },
    subtitle: { fontSize: fontSizes.xs, color: c.text.muted, marginTop: 1 },

    postPreview: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingHorizontal: spacing.lg, paddingVertical: 12,
      borderBottomWidth: 1, borderBottomColor: c.border,
      backgroundColor: c.bg.card,
    },
    previewAvatar: {
      width: 36, height: 36, borderRadius: 18,
      backgroundColor: c.bg.elevated,
      alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden',
    },
    previewAvatarEmoji: { fontSize: 18 },
    previewMeta: { flex: 1 },
    previewAuthor:  { fontSize: fontSizes.xs, fontWeight: '700', color: c.text.primary },
    previewContent: { fontSize: fontSizes.xs, color: c.text.muted, lineHeight: 17 },

    listContent: { padding: spacing.lg, gap: 16, flexGrow: 1 },

    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
    emptyEmoji: { fontSize: 44, marginBottom: 12 },
    emptyTitle: { fontSize: fontSizes.lg, fontWeight: '700', color: c.text.primary, marginBottom: 6 },
    emptyText:  { fontSize: fontSizes.sm, color: c.text.muted },

    commentRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
    commentAvatar: {
      width: 36, height: 36, borderRadius: 18,
      backgroundColor: c.bg.card, borderWidth: 1, borderColor: c.border,
      alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      overflow: 'hidden',
    },
    commentAvatarEmoji: { fontSize: 18 },
    commentBody: { flex: 1 },
    bubble: {
      backgroundColor: c.bg.card,
      borderRadius: radii.lg, borderTopLeftRadius: 4,
      borderWidth: 1, borderColor: c.border,
      paddingHorizontal: 12, paddingVertical: 10,
    },
    commentAuthor: { fontSize: fontSizes.sm, fontWeight: '700', color: c.text.primary },
    commentHandle: { fontSize: fontSizes.xs, color: c.text.muted, marginBottom: 4 },
    commentText:   { fontSize: fontSizes.sm, color: c.text.secondary, lineHeight: 19 },
    commentFooter: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 6, paddingLeft: 4 },
    commentTime:   { fontSize: fontSizes.xs, color: c.text.muted },
    replyBtn:      { fontSize: fontSizes.xs, color: c.primaryLight, fontWeight: '600' },
    likeBtn:       { flexDirection: 'row', alignItems: 'center', gap: 4 },
    likeCount:     { fontSize: fontSizes.xs, color: c.text.muted },

    inputBar: {
      flexDirection: 'row', alignItems: 'flex-end', gap: 10,
      paddingHorizontal: spacing.lg, paddingTop: 10,
      borderTopWidth: 1, borderTopColor: c.border,
      backgroundColor: c.bg.surface,
    },
    inputAvatar: {
      width: 34, height: 34, borderRadius: 17,
      backgroundColor: c.bg.card, borderWidth: 1, borderColor: c.border,
      alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginBottom: 2,
      overflow: 'hidden',
    },
    inputAvatarEmoji: { fontSize: 16 },
    input: {
      flex: 1,
      paddingHorizontal: 14, paddingVertical: 10,
      fontSize: fontSizes.sm, color: c.text.primary,
      maxHeight: 100,
      backgroundColor: c.bg.card,
      borderRadius: radii.xl,
    },
    inputContainer: {
      flex: 1,
      backgroundColor: c.bg.card,
      borderWidth: 1, borderColor: c.borderHover,
      borderRadius: radii.xl,
      // overflow must NOT be hidden here — it clips the @ mention / # hashtag
      // suggestion popover that SmartInput renders above the field.
      overflow: 'visible',
    },
    sendBtn: {
      width: 38, height: 38, borderRadius: 19,
      backgroundColor: c.primary,
      alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginBottom: 2,
    },
    sendBtnDisabled: { backgroundColor: c.bg.elevated },
  });
}

const formatRelativeTime = (dateString: string) => {
  const diffInSecs = Math.floor((new Date().getTime() - new Date(dateString).getTime()) / 1000);
  if (diffInSecs < 60) return 'now';
  const diffInMins = Math.floor(diffInSecs / 60);
  if (diffInMins < 60) return `${diffInMins}m`;
  const diffInHrs = Math.floor(diffInMins / 60);
  if (diffInHrs < 24) return `${diffInHrs}h`;
  const diffInDays = Math.floor(diffInHrs / 24);
  if (diffInDays < 7) return `${diffInDays}d`;
  return `${Math.floor(diffInDays / 7)}w`;
};

export default function CommentsScreen({ navigation, route }: Props) {
  const { user: CURRENT_USER } = useAuth();
  const { updateCommentCount } = usePosts();
  const queryClient = useQueryClient();
  const { post } = route.params;

  // The Home feed / bookmarks / profile posts render comment counts from the
  // react-query cache (PostsContext's array isn't what those screens show), so
  // bump every matching cache entry when a comment is added or removed.
  const bumpCachedCommentCount = React.useCallback((postId: string, delta: number) => {
    queryClient.getQueryCache().findAll().forEach((query) => {
      const key = query.queryKey;
      if (!Array.isArray(key) || key.length === 0) return;
      if (key[0] !== 'feed' && key[0] !== 'bookmarks' && key[0] !== 'profile') return;
      queryClient.setQueryData(key, (old: any) => {
        if (!old || !Array.isArray(old.pages)) return old;
        return {
          ...old,
          pages: old.pages.map((page: any[]) =>
            page.map((p: any) => {
              if (p.id !== postId) return p;
              const current = p.comments ?? (p as any).commentsCount ?? 0;
              const next = Math.max(0, current + delta);
              return { ...p, comments: next, commentsCount: next };
            })
          ),
        };
      });
    });
  }, [queryClient]);
  const insets   = useSafeAreaInsets();
  const { isDark } = useTheme();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [text, setText] = useState('');
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);

  const postAuthorId =
    (post as any)?.author?.id || (post as any)?.authorId || (post as any)?.author_id;

  const fetchComments = useCallback(async () => {
    try {
      const res = await commentService.getComments(post.id);
      if (res?.data) setComments(res.data);
    } catch (e) {
      console.error('Failed to fetch comments', e);
    } finally {
      setLoading(false);
    }
  }, [post.id]);

  useEffect(() => {
    fetchComments();
    // Opening the thread counts as a view — fire-and-forget so a slow/failed
    // request can never block the screen.
    postsService.recordView(post.id).catch(() => {});
  }, [fetchComments, post.id]);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setText('');
    updateCommentCount(post.id, 1);
    bumpCachedCommentCount(post.id, 1);
    try {
      const res = await commentService.createComment(post.id, trimmed);
      if (res?.data) {
        setComments(prev => [res.data, ...prev]);
      } else {
        fetchComments();
      }
    } catch (e) {
      console.error('Failed to post comment', e);
      updateCommentCount(post.id, -1);
      bumpCachedCommentCount(post.id, -1);
      fetchComments();
    }
  };

  const toggleLike = async (comment: Comment) => {
    const isLiked = !!comment.isLiked;
    setComments(prev => prev.map(c =>
      c.id === comment.id
        ? { ...c, isLiked: !isLiked, likesCount: isLiked ? c.likesCount - 1 : c.likesCount + 1 }
        : c
    ));
    try {
      if (isLiked) await commentService.unlikeComment(comment.id);
      else await commentService.likeComment(comment.id);
    } catch (e) {
      console.error('Failed to toggle like', e);
    }
  };

  const canDeleteComment = (comment: Comment) => {
    if (!CURRENT_USER?.id) return false;
    // Own comment, or the post owner moderating comments on their post.
    return (
      comment.author?.id === CURRENT_USER.id ||
      postAuthorId === CURRENT_USER.id
    );
  };

  const deleteComment = (comment: Comment) => {
    Alert.alert(
      'Delete comment',
      'Are you sure you want to delete this comment?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await commentService.deleteComment(comment.id);
              if (!comment.parentId) {
                updateCommentCount(post.id, -1);
                bumpCachedCommentCount(post.id, -1);
              }
            } catch (e) {
              console.error('Failed to delete comment', e);
            }
            setComments(prev => prev.filter(c => c.id !== comment.id));
          },
        },
      ],
    );
  };

  const postAvatar = (post as any)?.author?.avatarUrl || (post as any)?.author?.avatar_url;
  const postAuthorName = (post as any)?.author?.name || 'Post';

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <StatusBar style={isDark ? 'light' : 'dark'} />

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.title}>Comments</Text>
            <Text style={styles.subtitle}>{comments.length} comments</Text>
          </View>
        </View>

        {/* Post preview strip */}
        <View style={styles.postPreview}>
          <View style={{ position: 'relative' }}>
            <View style={styles.previewAvatar}>
              {postAvatar ? (
                <Image source={{ uri: postAvatar }} style={{ width: '100%', height: '100%' }} />
              ) : (
                <Text style={styles.previewAvatarEmoji}>👾</Text>
              )}
            </View>
            <PresenceDot userId={postAuthorId} size={12} />
          </View>
          <View style={styles.previewMeta}>
            <Text style={styles.previewAuthor}>{postAuthorName}</Text>
            <Text style={styles.previewContent} numberOfLines={2}>{(post as any).content || (post as any).title || ''}</Text>
          </View>
        </View>

        {/* Comment list */}
        {loading ? (
          <View style={styles.empty}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <FlatList
            data={comments}
            keyExtractor={item => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptyEmoji}>💬</Text>
                <Text style={styles.emptyTitle}>No comments yet</Text>
                <Text style={styles.emptyText}>Be the first to share your thoughts!</Text>
              </View>
            }
            renderItem={({ item }) => (
              <CommentRow
                comment={item}
                onLike={() => toggleLike(item)}
                onDelete={canDeleteComment(item) ? () => deleteComment(item) : undefined}
                styles={styles}
                colors={colors}
              />
            )}
          />
        )}

        {/* Input bar */}
        <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <View style={[styles.inputAvatar, { overflow: 'hidden' }]}>
            {CURRENT_USER?.avatarUrl ? (
              <Image source={{ uri: CURRENT_USER.avatarUrl }} style={{ width: '100%', height: '100%' }} />
            ) : (
              <Text style={styles.inputAvatarEmoji}>👾</Text>
            )}
          </View>
          <SmartInput
            style={styles.input}
            containerStyle={styles.inputContainer}
            placeholder="Add a comment…"
            placeholderTextColor={colors.text.muted}
            value={text}
            onChange={setText}
            multiline
            maxLength={500}
            suggestionPosition="top"
          />
          <TouchableOpacity
            onPress={handleSend}
            disabled={!text.trim()}
            style={[styles.sendBtn, !text.trim() && styles.sendBtnDisabled]}
          >
            <Ionicons name="send" size={17} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function CommentRow({
  comment, onLike, onDelete, styles, colors,
}: {
  comment: Comment;
  onLike: () => void;
  onDelete?: () => void;
  styles: ReturnType<typeof makeStyles>;
  colors: ColorPalette;
}) {
  const avatarUrl = comment.author?.avatarUrl || (comment.author as any)?.avatar_url;

  return (
    <View style={styles.commentRow}>
      <View style={{ position: 'relative' }}>
        <View style={styles.commentAvatar}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={{ width: '100%', height: '100%' }} />
          ) : (
            <Text style={styles.commentAvatarEmoji}>👾</Text>
          )}
        </View>
        <PresenceDot userId={comment.author?.id} size={12} />
      </View>
      <View style={styles.commentBody}>
        <View style={styles.bubble}>
          <Text style={styles.commentAuthor}>{comment.author?.name || comment.author?.username}</Text>
          <Text style={styles.commentHandle}>@{comment.author?.username}</Text>
          <Text style={styles.commentText}>{comment.content}</Text>
        </View>
        <View style={styles.commentFooter}>
          <Text style={styles.commentTime}>{formatRelativeTime(comment.createdAt)}</Text>
          <TouchableOpacity style={styles.likeBtn} onPress={onLike}>
            <Ionicons
              name={comment.isLiked ? 'heart' : 'heart-outline'}
              size={13}
              color={comment.isLiked ? colors.pink : colors.text.muted}
            />
            {comment.likesCount > 0 && (
              <Text style={[styles.likeCount, comment.isLiked && { color: colors.pink }]}>
                {comment.likesCount}
              </Text>
            )}
          </TouchableOpacity>
          {onDelete && (
            <TouchableOpacity onPress={onDelete}>
              <Ionicons name="trash-outline" size={13} color={colors.danger} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}
