import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, Image,
  StyleSheet, ActivityIndicator, 
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { fontSizes, spacing, radii, type ColorPalette } from '../../theme';
import { useThemeColors } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import SmartInput from '../common/SmartInput';
import PresenceDot from '../common/PresenceDot';
import { commentService, Comment } from '../../services/comment.service';
import { usePosts } from '../../context/PostsContext';
import { useQueryClient } from '@tanstack/react-query';
import type { Post, HomeStackParamList } from '../../types';
import { themedAlert } from '../common/ThemedAlert';

interface Props {
  post: Post;
  /** Optional header rendered above the comments (e.g. the post detail card on
      the detail page) — scrolls away with the list. */
  ListHeaderComponent?: React.ReactElement;
  /** Ref to the composer's input — lets the parent focus it (e.g. the post
      detail's comment button). */
  composerRef?: React.RefObject<any>;
  /** When set, the composer is hidden (comments-only view). */
  readOnly?: boolean;
  /** Called with +1/-1 when the visible comment count changes (add/delete). */
  onCountChange?: (delta: number) => void;
  /** When set (deep-linked mention/reply), scroll to and briefly highlight
      this comment once the thread loads (loading more pages as needed). */
  focusCommentId?: string;
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    listContent: { padding: spacing.lg, flexGrow: 1 },

    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
    emptyEmoji: { fontSize: 44, marginBottom: 12 },
    emptyTitle: { fontSize: fontSizes.lg, fontWeight: '700', color: c.text.primary, marginBottom: 6 },
    emptyText:  { fontSize: fontSizes.sm, color: c.text.muted },

    // ── Comment row (tree) ───────────────────────────────────────────
    commentWrapper: { marginBottom: 18 },
    commentWrapperHighlighted: {
      backgroundColor: "rgba(124,58,237,0.10)",
      borderRadius: radii.md,
      padding: 8,
      marginHorizontal: -8,
      borderWidth: 1,
      borderColor: "rgba(124,58,237,0.45)",
    },
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
    commentTime:   { fontSize: fontSizes.xs, color: c.text.muted, fontWeight: '500' },
    commentText:   { fontSize: fontSizes.sm, color: c.text.primary, lineHeight: 19 },
    commentFooter: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 6 },
    actionBtn:     { fontSize: fontSizes.xs, color: c.text.muted, fontWeight: '700' },
    likeBtn:       { alignItems: 'center', marginLeft: 4, marginTop: 2, minWidth: 22 },
    likeCount:     { fontSize: 10, color: c.text.muted, marginTop: 2 },

    // "View N replies" divider
    replyBtn:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
    replyLine:    { width: 24, height: 1, backgroundColor: c.borderHover },
    replyBtnText: { fontSize: fontSizes.xs, color: c.text.muted, fontWeight: '700' },

    // ── Sort toggle ──────────────────────────────────────────────────
    sortBar: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end',
      gap: 8, marginTop: 6, marginBottom: 14,
    },
    sortChip: {
      paddingHorizontal: 14, paddingVertical: 5,
      borderRadius: radii.full,
      borderWidth: 1, borderColor: c.border,
      backgroundColor: c.bg.card,
    },
    sortChipActive: {
      backgroundColor: 'rgba(124,58,237,0.15)',
      borderColor: 'rgba(124,58,237,0.45)',
    },
    sortChipText:     { fontSize: fontSizes.xs, fontWeight: '700', color: c.text.muted },
    sortChipTextActive: { color: c.primaryLight },

    // Nested replies — indented under the parent
    repliesContainer: { paddingLeft: 46, marginTop: 14, gap: 14 },

    // ── Composer ─────────────────────────────────────────────────────
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
    replyingStrip: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: spacing.lg, paddingVertical: 8,
      backgroundColor: c.bg.elevated,
      borderTopWidth: 1, borderTopColor: c.border,
    },
    replyingText: { fontSize: fontSizes.xs, color: c.text.muted },
  });
}

export const formatRelativeTime = (dateString: string) => {
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

/**
 * Tree-style comment thread: paginated top-level comments, each with lazy
 * "View N replies" children (one indent level), per-comment Reply / Delete /
 * like, and a composer with a "Replying to X" strip. Used by the post detail
 * page AND the standalone comments screen so the comment UX stays in one place.
 * Matches the app's CommentsModal behavior.
 */
export default function CommentsThread({
  post,
  ListHeaderComponent,
  composerRef,
  readOnly,
  onCountChange,
  focusCommentId,
}: Props) {
  const { user: CURRENT_USER } = useAuth();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { updateCommentCount } = usePosts();
  const queryClient = useQueryClient();
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();

  const [text, setText] = useState('');
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyingTo, setReplyingTo] = useState<Comment | null>(null);
  const [sort, setSort] = useState<'top' | 'newest'>('newest');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const localComposerRef = useRef<any>(null);
  const effectiveComposerRef = composerRef || localComposerRef;
  const listRef = useRef<FlatList<any>>(null);
  // Mirrors of list state so the async scroll-to-comment flow reads fresh
  // values instead of stale closures.
  const commentsRef = useRef<Comment[]>(comments);
  const pageRef = useRef(page);
  const hasMoreRef = useRef(hasMore);
  useEffect(() => { commentsRef.current = comments; }, [comments]);
  useEffect(() => { pageRef.current = page; }, [page]);
  useEffect(() => { hasMoreRef.current = hasMore; }, [hasMore]);

  const postAuthorId =
    (post as any)?.author?.id || (post as any)?.authorId || (post as any)?.author_id;

  // The Home feed / bookmarks / profile posts render comment counts from the
  // react-query cache (PostsContext's array isn't what those screens show), so
  // bump every matching cache entry when a comment is added or removed. The
  // server counts top-level AND reply comments in post.comments, so bump for
  // both.
  const bumpCachedCommentCount = useCallback((postId: string, delta: number) => {
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

  const bumpCount = useCallback((delta: number) => {
    updateCommentCount(post.id, delta);
    bumpCachedCommentCount(post.id, delta);
    onCountChange?.(delta);
  }, [post.id, updateCommentCount, bumpCachedCommentCount, onCountChange]);

  const fetchTopLevelComments = useCallback(async (
    nextPage = 1,
    append = false,
    sortOverride?: 'top' | 'newest',
  ) => {
    try {
      const res = await commentService.getComments(post.id, null, nextPage, 20, sortOverride ?? sort);
      const rows = res?.data || [];
      const meta = res?.meta as any;
      setHasMore(meta ? !!meta.hasNext : rows.length === 20);
      setComments((prev) =>
        append
          ? [...prev, ...rows.filter((r: any) => !prev.some((c) => c.id === r.id))]
          : rows,
      );
      setPage(nextPage);
    } catch (e) {
      console.error('Failed to fetch comments', e);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [post.id, sort]);

  // Switching sort refetches from page 1 with the new order.
  const changeSort = useCallback((next: 'top' | 'newest') => {
    if (next === sort) return;
    setSort(next);
    setLoading(true);
    fetchTopLevelComments(1, false, next).finally(() => setLoading(false));
  }, [sort, fetchTopLevelComments]);

  useEffect(() => {
    fetchTopLevelComments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.id]);

  const fetchReplies = useCallback(async (parentComment: Comment) => {
    try {
      const res = await commentService.getComments(post.id, parentComment.id, 1, 20, sort);
      setComments((prev) =>
        prev.map((c) =>
          c.id === parentComment.id
            ? { ...c, hasFetchedReplies: true, subComments: res?.data || [] }
            : c,
        ),
      );
    } catch (e) {
      console.error('Failed to fetch replies', e);
    }
  }, [post.id, sort]);

  // Deep-linked comment (mention/reply notification): resolve the comment, load
  // whatever top-level pages are needed to reach it (or its parent when it's a
  // nested reply), expand the parent's replies, scroll it into view and
  // pulse-highlight it for a few seconds.
  useEffect(() => {
    if (!focusCommentId) return;
    let cancelled = false;
    const pulse = (id: string) => {
      setHighlightId(id);
      setTimeout(() => {
        if (!cancelled) setHighlightId(null);
      }, 4000);
    };
    (async () => {
      try {
        const res = await commentService.getComment(focusCommentId);
        const target = res?.data;
        if (!target) return;
        const targetId = String(target.id || '');
        const parentId = target.parentId || target.parent_id || null;
        const anchorId = parentId || targetId;
        // Fetch top-level pages until the anchor is present (bounded loop —
        // gives up after 25 pages if the server keeps saying there's more).
        let guard = 0;
        while (
          !commentsRef.current.some((c) => c.id === anchorId) &&
          hasMoreRef.current &&
          guard < 25
        ) {
          guard += 1;
          await fetchTopLevelComments(pageRef.current + 1, true);
          if (cancelled) return;
        }
        if (cancelled) return;
        const list = commentsRef.current;
        if (parentId) {
          const parent = list.find((c) => c.id === parentId);
          if (parent && !parent.hasFetchedReplies && (parent.replies || 0) > 0) {
            await fetchReplies(parent);
            if (cancelled) return;
          }
          const idx = list.findIndex((c) => c.id === parentId);
          if (idx >= 0) {
            listRef.current?.scrollToIndex({ index: idx, viewPosition: 0.08 });
            pulse(targetId);
          }
        } else {
          const idx = list.findIndex((c) => c.id === targetId);
          if (idx >= 0) {
            listRef.current?.scrollToIndex({ index: idx, viewPosition: 0.08 });
            pulse(targetId);
          }
        }
      } catch (e) {
        console.warn('Failed to resolve focused comment', e);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusCommentId]);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;

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
        id: CURRENT_USER?.id || '',
        name: CURRENT_USER?.name || 'User',
        username: CURRENT_USER?.username || 'user',
        avatarUrl: CURRENT_USER?.avatarUrl,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setText('');
    setReplyingTo(null);
    bumpCount(1);

    // Optimistic UI — a reply nests under its parent, a comment goes on top.
    setComments((prev) => {
      if (parentId) {
        return prev.map((c) =>
          c.id === parentId
            ? {
                ...c,
                replies: (c.replies || 0) + 1,
                hasFetchedReplies: true,
                subComments: [...((c as any).subComments || []), optimisticComment],
              }
            : c,
        );
      }
      return [optimisticComment, ...prev];
    });

    try {
      const res = await commentService.createComment(post.id, trimmed, parentId);
      // Replace the optimistic row with the server row so the id is real
      // (enables future reply/delete on it). Safety net: if the server
      // response ever lacks the author join, fill it from the current user so
      // the comment never renders nameless / icon-only until the next fetch.
      if (res?.data) {
        const serverRow: Comment = res.data;
        const enriched: Comment = {
          ...serverRow,
          author: {
            id: serverRow.author?.id || CURRENT_USER?.id || '',
            name: serverRow.author?.name || CURRENT_USER?.name || 'User',
            username: serverRow.author?.username || CURRENT_USER?.username || 'user',
            avatarUrl: serverRow.author?.avatarUrl || CURRENT_USER?.avatarUrl,
          },
        };
        setComments((prev) => {
          const replace = (list: Comment[]): Comment[] =>
            list.map((c) => {
              if (c.id === optimisticComment.id) return enriched;
              if ((c as any).subComments) {
                return { ...c, subComments: replace((c as any).subComments) };
              }
              return c;
            });
          return replace(prev);
        });
      }
    } catch (e) {
      console.error('Failed to post comment', e);
      bumpCount(-1);
      // Roll back the optimistic row.
      setComments((prev) => {
        const remove = (list: Comment[]): Comment[] =>
          list
            .filter((c) => c.id !== optimisticComment.id)
            .map((c) => (c as any).subComments ? { ...c, subComments: remove((c as any).subComments) } : c);
        return remove(prev);
      });
    }
  };

  const toggleLike = async (comment: Comment) => {
    const isLiked = !!comment.isLiked;
    const updateInList = (list: Comment[]): Comment[] =>
      list.map((c) => {
        if (c.id === comment.id) {
          return {
            ...c,
            isLiked: !isLiked,
            likesCount: Math.max(0, (c.likesCount || 0) + (isLiked ? -1 : 1)),
          };
        }
        if ((c as any).subComments) {
          return { ...c, subComments: updateInList((c as any).subComments) };
        }
        return c;
      });
    setComments((prev) => updateInList(prev));
    try {
      if (isLiked) await commentService.unlikeComment(comment.id);
      else await commentService.likeComment(comment.id);
    } catch (e) {
      console.error('Failed to toggle comment like', e);
    }
  };

  const canDeleteComment = (comment: Comment) => {
    if (!CURRENT_USER?.id) return false;
    // Own comment, or the post owner moderating comments on their post.
    return comment.author?.id === CURRENT_USER.id || postAuthorId === CURRENT_USER.id;
  };

  const deleteComment = (comment: Comment) => {
    themedAlert(
      'Delete comment',
      'Are you sure you want to delete this comment?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            bumpCount(-1);
            // Remove from the tree (top-level or nested).
            const removeFromList = (list: Comment[]): Comment[] =>
              list
                .filter((c) => c.id !== comment.id)
                .map((c) => (c as any).subComments ? { ...c, subComments: removeFromList((c as any).subComments) } : c);
            setComments((prev) => removeFromList(prev));
            try {
              await commentService.deleteComment(comment.id);
            } catch (e) {
              console.error('Failed to delete comment', e);
              bumpCount(1);
              fetchTopLevelComments();
            }
          },
        },
      ],
    );
  };

  const renderParsedText = (textContent: string) => {
    if (!textContent) return null;
    return textContent
      .split(/(\{@\}\[[^\]]+\]\([^)]+\)|\{#\}\[[^\]]+\]\([^)]+\)|@\w+|#\w+)/g)
      .map((part, i) => {
        const mentionMatch = part.match(/^\{@\}\[([^\]]+)\]\(([^)]+)\)$/);
        if (mentionMatch) {
          const [, name, id] = mentionMatch;
          return (
            <Text
              key={i}
              style={{ color: colors.primaryLight, fontWeight: '600' }}
              onPress={() => navigation.push('UserProfile', { user: { id, name, username: name } as any })}
            >
              @{name}
            </Text>
          );
        }
        if (part.startsWith('@')) {
          return (
            <Text
              key={i}
              style={{ color: colors.primaryLight, fontWeight: '600' }}
              onPress={() => navigation.push('UserProfile', { user: { id: part.slice(1), name: part.slice(1), username: part.slice(1) } as any })}
            >
              {part}
            </Text>
          );
        }
        return <Text key={i}>{part}</Text>;
      });
  };

  const renderComment = (comment: Comment, isReply = false, rootComment?: Comment) => {
    const avatarUrl = comment.author?.avatarUrl || (comment.author as any)?.avatar_url;
    const subComments = (comment as any).subComments as Comment[] | undefined;

    return (
      <View
        key={comment.id}
        style={[
          styles.commentWrapper,
          comment.id === highlightId && styles.commentWrapperHighlighted,
        ]}
      >
        <View style={styles.commentRow}>
          <TouchableOpacity
            onPress={() => {
              const author = comment.author;
              if (author?.id || author?.username) {
                navigation.push('UserProfile', { user: author as any });
              }
            }}
          >
            <View style={[styles.commentAvatar, isReply && { width: 28, height: 28, borderRadius: 14 }]}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={{ width: '100%', height: '100%' }} />
              ) : (
                <Text style={[styles.commentAvatarEmoji, isReply && { fontSize: 14 }]}>👾</Text>
              )}
              <PresenceDot userId={comment.author?.id} size={isReply ? 10 : 12} />
            </View>
          </TouchableOpacity>

          <View style={styles.commentBody}>
            <Text style={styles.commentAuthor}>
              {comment.author?.username}{'  '}
              <Text style={styles.commentTime}>{formatRelativeTime(comment.createdAt)}</Text>
            </Text>
            <Text style={styles.commentText}>{renderParsedText(comment.content)}</Text>

            <View style={styles.commentFooter}>
              <TouchableOpacity
                onPress={() => {
                  // Replying to a reply still hangs off the ROOT comment (the
                  // app's tree is one level deep), prefilled with the target's
                  // handle so it reads as a direct reply.
                  setReplyingTo(rootComment || comment);
                  setText(`@${comment.author?.username || 'user'} `);
                  effectiveComposerRef.current?.focus();
                }}
              >
                <Text style={styles.actionBtn}>Reply</Text>
              </TouchableOpacity>
              {canDeleteComment(comment) && (
                <TouchableOpacity onPress={() => deleteComment(comment)}>
                  <Text style={[styles.actionBtn, { color: colors.danger }]}>Delete</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Lazy replies */}
            {!isReply && (comment.replies || 0) > 0 && !comment.hasFetchedReplies && (
              <TouchableOpacity style={styles.replyBtn} onPress={() => fetchReplies(comment)}>
                <View style={styles.replyLine} />
                <Text style={styles.replyBtnText}>View {comment.replies} replies</Text>
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity style={styles.likeBtn} onPress={() => toggleLike(comment)}>
            <Ionicons
              name={comment.isLiked ? 'heart' : 'heart-outline'}
              size={14}
              color={comment.isLiked ? colors.pink : colors.text.muted}
            />
            {comment.likesCount > 0 && (
              <Text style={[styles.likeCount, comment.isLiked && { color: colors.pink }]}>
                {comment.likesCount}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Nested replies */}
        {!isReply && subComments && subComments.length > 0 && (
          <View style={styles.repliesContainer}>
            {subComments.map((sub) => renderComment(sub, true, comment))}
          </View>
        )}
      </View>
    );
  };

  return (
    <>
      <FlatList
        ref={listRef}
        data={comments}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        style={{ flex: 1 }}
        contentContainerStyle={styles.listContent}
        onScrollToIndexFailed={({ index, averageItemLength }) => {
          listRef.current?.scrollToOffset({
            offset: Math.max(0, averageItemLength * index - 40),
            animated: true,
          });
        }}
        // The header (e.g. the post detail card) renders even while comments
        // load so a post tap shows content immediately, not a blank spinner.
        // The sort toggle sits under whatever header the parent provided.
        ListHeaderComponent={
          <View>
            {ListHeaderComponent}
            <View style={styles.sortBar}>
              {(['top', 'newest'] as const).map((opt) => (
                <TouchableOpacity
                  key={opt}
                  style={[styles.sortChip, sort === opt && styles.sortChipActive]}
                  onPress={() => changeSort(opt)}
                >
                  <Text style={[styles.sortChipText, sort === opt && styles.sortChipTextActive]}>
                    {opt === 'top' ? 'Top' : 'Newest'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        }
        onEndReached={() => {
          if (hasMore && !loadingMore) {
            setLoadingMore(true);
            fetchTopLevelComments(page + 1, true);
          }
        }}
        onEndReachedThreshold={0.4}
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator
              size="small"
              color={colors.primary}
              style={{ paddingVertical: 14 }}
            />
          ) : null
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles.empty}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>💬</Text>
              <Text style={styles.emptyTitle}>No comments yet</Text>
              <Text style={styles.emptyText}>Be the first to share your thoughts!</Text>
            </View>
          )
        }
        renderItem={({ item }) => renderComment(item)}
      />

      {!readOnly && (
        <>
          {replyingTo && (
            <View style={styles.replyingStrip}>
              <Text style={styles.replyingText}>
                Replying to <Text style={{ fontWeight: '700' }}>{replyingTo.author?.username}</Text>
              </Text>
              <TouchableOpacity onPress={() => setReplyingTo(null)}>
                <Ionicons name="close-circle" size={18} color={colors.text.muted} />
              </TouchableOpacity>
            </View>
          )}

          <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <View style={[styles.inputAvatar, { overflow: 'hidden' }]}>
              {CURRENT_USER?.avatarUrl ? (
                <Image source={{ uri: CURRENT_USER.avatarUrl }} style={{ width: '100%', height: '100%' }} />
              ) : (
                <Text style={styles.inputAvatarEmoji}>👾</Text>
              )}
            </View>
            <SmartInput
              ref={effectiveComposerRef}
              style={styles.input}
              containerStyle={styles.inputContainer}
              placeholder={replyingTo ? 'Add a reply…' : 'Add a comment…'}
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
        </>
      )}
    </>
  );
}
