const COMMENTS: any[] = [];
import React, { useMemo, useState, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { fontSizes, spacing, radii, type ColorPalette } from '../../theme';
import { useTheme, useThemeColors } from '../../context/ThemeContext';
import type { HomeStackParamList, Comment } from '../../types';
import { useAuth } from '../../context/AuthContext';
import SmartInput from '../../components/common/SmartInput';

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
    },
    inputAvatarEmoji: { fontSize: 16 },
    input: {
      flex: 1,
      paddingHorizontal: 14, paddingVertical: 10,
      fontSize: fontSizes.sm, color: c.text.primary,
      maxHeight: 100,
      backgroundColor: c.bg.card,
    },
    inputContainer: {
      flex: 1,
      backgroundColor: c.bg.card,
      borderWidth: 1, borderColor: c.borderHover,
      borderRadius: radii.xl,
      overflow: 'hidden',
    },
    sendBtn: {
      width: 38, height: 38, borderRadius: 19,
      backgroundColor: c.primary,
      alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginBottom: 2,
    },
    sendBtnDisabled: { backgroundColor: c.bg.elevated },
  });
}

export default function CommentsScreen({ navigation, route }: Props) {
  const { user: CURRENT_USER } = useAuth();
  const { post } = route.params;
  const insets   = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const { isDark } = useTheme();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [text,     setText]     = useState('');
  const [comments, setComments] = useState<Comment[]>(
    COMMENTS.filter(c => c.postId === post.id)
  );

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const newComment: Comment = {
      id: `cm_${Date.now()}`,
      postId: post.id,
      author: {
        id: CURRENT_USER.id,
        name: (CURRENT_USER?.name || 'Taddle User'),
        handle: (CURRENT_USER?.username || 'user'),
        avatar: '👾',
      },
      text: trimmed,
      likes: 0,
      isLiked: false,
      createdAt: 'just now',
    };
    setComments(prev => [newComment, ...prev]);
    setText('');
  };

  const toggleLike = (id: string) => {
    setComments(prev => prev.map(c =>
      c.id === id
        ? { ...c, isLiked: !c.isLiked, likes: c.isLiked ? c.likes - 1 : c.likes + 1 }
        : c
    ));
  };

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
          <View style={styles.previewAvatar}>
            <Text style={styles.previewAvatarEmoji}>{post.author.avatar}</Text>
          </View>
          <View style={styles.previewMeta}>
            <Text style={styles.previewAuthor}>{post.author.name}</Text>
            <Text style={styles.previewContent} numberOfLines={2}>{post.content}</Text>
          </View>
        </View>

        {/* Comment list */}
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
            <CommentRow comment={item} onLike={toggleLike} styles={styles} colors={colors} />
          )}
        />

        {/* Input bar */}
        <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <View style={styles.inputAvatar}>
            <Text style={styles.inputAvatarEmoji}>{CURRENT_USER?.avatarUrl ? null : '👾'}</Text>
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
  comment, onLike, styles, colors,
}: {
  comment: Comment;
  onLike: (id: string) => void;
  styles: ReturnType<typeof makeStyles>;
  colors: ColorPalette;
}) {
  return (
    <View style={styles.commentRow}>
      <View style={styles.commentAvatar}>
        <Text style={styles.commentAvatarEmoji}>{comment.author.avatar}</Text>
      </View>
      <View style={styles.commentBody}>
        <View style={styles.bubble}>
          <Text style={styles.commentAuthor}>{comment.author.name}</Text>
          <Text style={styles.commentHandle}>{comment.author.handle}</Text>
          <Text style={styles.commentText}>{comment.text}</Text>
        </View>
        <View style={styles.commentFooter}>
          <Text style={styles.commentTime}>{comment.createdAt}</Text>
          {(comment.replies ?? 0) > 0 && (
            <TouchableOpacity>
              <Text style={styles.replyBtn}>{comment.replies} Replies</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.likeBtn} onPress={() => onLike(comment.id)}>
            <Ionicons
              name={comment.isLiked ? 'heart' : 'heart-outline'}
              size={13}
              color={comment.isLiked ? colors.pink : colors.text.muted}
            />
            {comment.likes > 0 && (
              <Text style={[styles.likeCount, comment.isLiked && { color: colors.pink }]}>
                {comment.likes}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
