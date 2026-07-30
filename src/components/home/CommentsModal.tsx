import React, { useMemo, useState, useRef, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, Modal, Animated, Dimensions, TouchableWithoutFeedback, Keyboard, ActivityIndicator, Image
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { fontSizes, spacing, radii, type ColorPalette } from '../../theme';
import { useTheme, useThemeColors } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import SmartInput from '../../components/common/SmartInput';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { HomeStackParamList, Post } from '../../types';
import { commentService, Comment } from '../../services/comment.service';

const { height: SCREEN_H } = Dimensions.get('window');

interface Props {
  visible: boolean;
  onClose: () => void;
  post: Post | null;
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    sheet: {
      flex: 1,
      maxHeight: SCREEN_H * 0.70,
      backgroundColor: c.bg.base,
      borderTopLeftRadius: radii.xl,
      borderTopRightRadius: radii.xl,
      overflow: 'hidden',
    },
    dragHandle: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.borderHover,
      marginTop: 8,
      marginBottom: 8,
    },
    dragHandle: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.borderHover,
      marginTop: 8,
      marginBottom: 8,
    },
    header: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: spacing.lg, paddingBottom: 12,
      borderBottomWidth: 1, borderBottomColor: c.border,
    },
    closeBtn: { padding: 8, marginLeft: 8 },
    title: { flex: 1, textAlign: 'center', fontSize: fontSizes.md, fontWeight: '800', color: c.text.primary },
    listContent: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, flexGrow: 1 },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
    emptyTitle: { fontSize: fontSizes.lg, fontWeight: '700', color: c.text.primary, marginBottom: 6 },
    emptyText:  { fontSize: fontSizes.sm, color: c.text.muted },

    commentWrapper: { marginBottom: 16 },
    commentRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
    commentAvatar: {
      width: 36, height: 36, borderRadius: 18,
      backgroundColor: c.bg.card, borderWidth: 1, borderColor: c.border,
      alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      overflow: 'hidden',
    },
    commentAvatarEmoji: { fontSize: 18 },
    commentBody: { flex: 1 },
    commentAuthor: { fontSize: fontSizes.sm, fontWeight: '700', color: c.text.primary, marginBottom: 2 },
    commentText:   { fontSize: fontSizes.sm, color: c.text.primary, lineHeight: 19 },
    commentFooter: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 4 },
    commentTime:   { fontSize: fontSizes.xs, color: c.text.muted },
    actionBtn:     { fontSize: fontSizes.xs, color: c.text.muted, fontWeight: '600' },
    replyBtn:      { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
    replyLine:     { width: 24, height: 1, backgroundColor: c.borderHover },
    replyBtnText:  { fontSize: fontSizes.xs, color: c.text.muted, fontWeight: '600' },

    likeBtn: { alignItems: 'center', marginLeft: 10, marginTop: 4 },
    likeCount: { fontSize: 10, color: c.text.muted, marginTop: 2 },

    repliesContainer: { paddingLeft: 46, marginTop: 12 },

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
    },
    inputAvatarEmoji: { fontSize: 16 },
    inputContainer: {
      flex: 1,
      backgroundColor: c.bg.card,
      borderWidth: 1, borderColor: c.borderHover,
      borderRadius: radii.xl,
      overflow: 'hidden',
    },
    input: {
      flex: 1,
      paddingHorizontal: 14, paddingVertical: 10,
      fontSize: fontSizes.sm, color: c.text.primary,
      maxHeight: 100,
    },
    sendBtn: {
      width: 38, height: 38, borderRadius: 19,
      backgroundColor: c.primary,
      alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginBottom: 2,
    },
    sendBtnDisabled: { backgroundColor: c.bg.elevated },
    replyingStrip: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: spacing.lg, paddingVertical: 8,
      backgroundColor: c.bg.elevated,
      borderTopWidth: 1, borderTopColor: c.border,
    },
    replyingText: { fontSize: fontSizes.xs, color: c.text.muted },
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

export default function CommentsModal({ visible, onClose, post }: Props) {
  const { user: CURRENT_USER } = useAuth();
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();

  const [text, setText] = useState('');
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Comment | null>(null);

  const translateY = useRef(new Animated.Value(SCREEN_H)).current;

  const handleClose = () => {
    Keyboard.dismiss();
    onClose();
  };

  useEffect(() => {
    if (visible && post) {
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
      fetchTopLevelComments();
    } else {
      Animated.timing(translateY, { toValue: SCREEN_H, duration: 250, useNativeDriver: true }).start();
    }
  }, [visible, post]);

  const fetchTopLevelComments = async () => {
    if (!post) return;
    setLoading(true);
    try {
      const res = await commentService.getComments(post.id);
      if (res.data) setComments(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || !post) return;

    const parentId = replyingTo ? replyingTo.id : null;
    const optimisticComment: Comment = {
      id: `temp_${Date.now()}`,
      postId: post.id,
      parentId,
      content: trimmed,
      depth: replyingTo ? replyingTo.depth + 1 : 0,
      path: [],
      likesCount: 0,
      status: 'active',
      author: {
        id: CURRENT_USER.id,
        name: CURRENT_USER.name || 'User',
        username: CURRENT_USER.username || 'user',
        avatarUrl: CURRENT_USER.avatarUrl,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setText('');
    setReplyingTo(null);

    // Optimistic UI update
    setComments((prev) => {
      if (parentId) {
        return prev.map(c => {
          if (c.id === parentId) {
            return { ...c, replies: (c.replies || 0) + 1, hasFetchedReplies: true, subComments: [...(c as any).subComments || [], optimisticComment] };
          }
          return c;
        });
      }
      return [optimisticComment, ...prev];
    });

    try {
      await commentService.createComment(post.id, trimmed, parentId);
      if (!parentId) fetchTopLevelComments();
    } catch (e) {
      console.error(e);
    }
  };

  const handleLike = async (commentId: string, isCurrentlyLiked: boolean) => {
    // Optimistic update
    const updateInList = (list: Comment[]): Comment[] => list.map(c => {
      if (c.id === commentId) {
        return { ...c, isLiked: !isCurrentlyLiked, likesCount: isCurrentlyLiked ? c.likesCount - 1 : c.likesCount + 1 };
      }
      if ((c as any).subComments) {
        return { ...c, subComments: updateInList((c as any).subComments) };
      }
      return c;
    });

    setComments(prev => updateInList(prev));

    try {
      if (isCurrentlyLiked) await commentService.unlikeComment(commentId);
      else await commentService.likeComment(commentId);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchReplies = async (parentComment: Comment) => {
    if (!post) return;
    try {
      const res = await commentService.getComments(post.id, parentComment.id);
      setComments(prev => prev.map(c => 
        c.id === parentComment.id ? { ...c, hasFetchedReplies: true, subComments: res.data } : c
      ));
    } catch (e) {
      console.error(e);
    }
  };

  const renderParsedText = (text: string) => {
    if (!text) return null;
    return text.split(/(\{@\}\[[^\]]+\]\([^)]+\)|\{#\}\[[^\]]+\]\([^)]+\)|@\w+|#\w+)/g).map((part, i) => {
      const mentionMatch = part.match(/^\{@\}\[([^\]]+)\]\(([^)]+)\)$/);
      if (mentionMatch) {
        const [, name, id] = mentionMatch;
        return (
          <Text key={i} style={{ color: colors.primaryLight, fontWeight: '600' }} onPress={() => { handleClose(); navigation.navigate('UserProfile', { user: { id, name, username: name } as any }); }}>
            @{name}
          </Text>
        );
      }
      if (part.startsWith('@')) {
        return (
          <Text key={i} style={{ color: colors.primaryLight, fontWeight: '600' }} onPress={() => { handleClose(); navigation.navigate('UserProfile', { user: { id: part.slice(1), name: part.slice(1), username: part.slice(1) } as any }); }}>
            {part}
          </Text>
        );
      }
      return <Text key={i}>{part}</Text>;
    });
  };

  const renderComment = (comment: Comment, isReply = false, rootComment?: Comment) => (
    <View key={comment.id} style={styles.commentWrapper}>
      <View style={styles.commentRow}>
        <TouchableOpacity onPress={() => { handleClose(); navigation.navigate('UserProfile', { user: comment.author as any }); }}>
          <View style={[styles.commentAvatar, isReply && { width: 28, height: 28, borderRadius: 14 }]}>
            {comment.author?.avatarUrl || (comment.author as any)?.avatar_url ? (
              <Image source={{ uri: comment.author.avatarUrl || (comment.author as any).avatar_url }} style={{ width: '100%', height: '100%' }} />
            ) : (
              <Text style={[styles.commentAvatarEmoji, isReply && { fontSize: 14 }]}>👾</Text>
            )}
          </View>
        </TouchableOpacity>
        
        <View style={styles.commentBody}>
          <Text style={styles.commentAuthor}>
            {comment.author.username}{'  '}
            <Text style={styles.commentTime}>{formatRelativeTime(comment.createdAt)}</Text>
          </Text>
          <Text style={styles.commentText}>{renderParsedText(comment.content)}</Text>
          
          <View style={styles.commentFooter}>
            <TouchableOpacity onPress={() => {
              setReplyingTo(rootComment || comment);
              setText(`@${comment.author.username} `);
            }}>
              <Text style={styles.actionBtn}>Reply</Text>
            </TouchableOpacity>
          </View>

          {/* View Replies Button */}
          {!isReply && (comment.replies || 0) > 0 && !comment.hasFetchedReplies && (
            <TouchableOpacity style={styles.replyBtn} onPress={() => fetchReplies(comment)}>
              <View style={styles.replyLine} />
              <Text style={styles.replyBtnText}>View {comment.replies} replies</Text>
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity style={styles.likeBtn} onPress={() => handleLike(comment.id, !!comment.isLiked)}>
          <Ionicons name={comment.isLiked ? "heart" : "heart-outline"} size={14} color={comment.isLiked ? colors.pink : colors.text.muted} />
          {comment.likesCount > 0 && <Text style={[styles.likeCount, comment.isLiked && { color: colors.pink }]}>{comment.likesCount}</Text>}
        </TouchableOpacity>
      </View>

      {/* Render Subcomments */}
      {!isReply && (comment as any).subComments && (comment as any).subComments.length > 0 && (
        <View style={styles.repliesContainer}>
          {(comment as any).subComments.map((sub: Comment) => renderComment(sub, true, comment))}
        </View>
      )}
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <KeyboardAvoidingView 
        style={[styles.overlay, { paddingTop: insets.top + 10 }]}
        behavior={Platform.OS === 'ios' ? 'height' : undefined}
      >
        <TouchableWithoutFeedback onPress={handleClose}>
          <View style={StyleSheet.absoluteFill} />
        </TouchableWithoutFeedback>

        <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
          <View style={styles.dragHandle} />
          <View style={styles.header}>
            <Text style={styles.title}>Comments</Text>
            <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={colors.text.primary} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <ActivityIndicator style={{ flex: 1 }} color={colors.primary} />
          ) : (
            <FlatList
              data={comments}
              keyExtractor={item => item.id}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Text style={styles.emptyTitle}>No comments yet.</Text>
                  <Text style={styles.emptyText}>Start the conversation.</Text>
                </View>
              }
              renderItem={({ item }) => renderComment(item)}
            />
          )}

          {replyingTo && (
            <View style={styles.replyingStrip}>
              <Text style={styles.replyingText}>Replying to <Text style={{ fontWeight: '700' }}>{replyingTo.author.username}</Text></Text>
              <TouchableOpacity onPress={() => setReplyingTo(null)}>
                <Ionicons name="close-circle" size={18} color={colors.text.muted} />
              </TouchableOpacity>
            </View>
          )}

          <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <View style={styles.inputAvatar}>
              {CURRENT_USER?.avatarUrl ? (
                <Image source={{ uri: CURRENT_USER.avatarUrl }} style={{ width: '100%', height: '100%', borderRadius: 17 }} />
              ) : (
                <Text style={styles.inputAvatarEmoji}>👾</Text>
              )}
            </View>
            <SmartInput
              style={styles.input}
              containerStyle={styles.inputContainer}
              placeholder={replyingTo ? "Add a reply..." : "Add a comment..."}
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
              <Ionicons name="arrow-up" size={17} color="#fff" />
            </TouchableOpacity>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
