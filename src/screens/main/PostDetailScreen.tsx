import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, Image,
  StyleSheet,  Platform, KeyboardAvoidingView, Share, BackHandler,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQueryClient } from '@tanstack/react-query';
import { fontSizes, spacing, type ColorPalette } from '../../theme';
import { useTheme, useThemeColors } from '../../context/ThemeContext';
import type { RootStackParamList } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { postsService } from '../../services/posts.service';
import PostCard from '../../components/home/PostCard';
import CommentsThread from '../../components/home/CommentsThread';
import { themedAlert } from '../../components/common/ThemedAlert';
import { userService } from '../../services/user.service';
import { communityService } from '../../services/community.service';

type Props = NativeStackScreenProps<RootStackParamList, 'PostDetail'>;

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg.base },
    // Sticky header — back, author identity, share. The card's own ⋯ menu
    // handles delete/report, so this stays minimal.
    header: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: spacing.sm, paddingVertical: 8, gap: 4,
    },
    headerBtn: {
      width: 38, height: 38, borderRadius: 19,
      alignItems: 'center', justifyContent: 'center',
    },
    // Absolutely centered so the author name/@handle sit dead-center on the
    // screen regardless of the back button on the left (there's no right-side
    // button to balance it in normal flow).
    headerCenter: {
      position: 'absolute', left: 0, right: 0,
      alignItems: 'center', paddingHorizontal: 4,
    },
    headerName: { fontSize: fontSizes.md, fontWeight: '800', color: c.text.primary },
    headerHandle: { fontSize: fontSizes.xs, color: c.text.muted, marginTop: 1 },
  });
}

/**
 * Post detail page built from the app's OWN card + comment UI — the top is the
 * exact same PostCard (or embedded RepostedPostCard preview) used across feed /
 * profile / community, so every native action works identically:
 *   - like button + likers list (bottom sheet) on tap of the count
 *   - comment bubble focuses the composer right below
 *   - repost: creator sees the reposters list, everyone else gets the repost
 *     sheet (verbatim or quote, with audience selection) — long-press always
 *     shows the reposters list
 *   - ⋯ menu: Delete for the creator, Report for third parties
 * Below the card sits the paginated tree comment thread with a pinned composer.
 * State is re-fetched on mount so counts reflect the server unless the user
 * already interacted.
 */
export default function PostDetailScreen({ navigation, route }: Props) {
  // Params come from the shared PostDetailParams type (single source of truth
  // for both the root-stack and Home-stack registrations).
  const { post: initialPost, commentId: focusCommentId } = route.params;
  const { user: currentUser } = useAuth();
  const colors = useThemeColors();
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const queryClient = useQueryClient();

  // The live post drives the card — its like/save/repost flags and counts must
  // stay current as the user interacts here and comments stream in below.
  const [livePost, setLivePost] = useState<any>(initialPost);
  const [accessRestricted, setAccessRestricted] = useState<'private_user' | 'private_community' | null>(null);
  const [isCheckingAccess, setIsCheckingAccess] = useState(true);
  const [followRequested, setFollowRequested] = useState(false);
  const [joinRequested, setJoinRequested] = useState(false);

  const livePostRef = useRef<any>(livePost);
  livePostRef.current = livePost;
  const composerRef = useRef<any>(null);
  const interactedRef = useRef(false);

  // ── Author / identity ─────────────────────────────────────────────
  const author = useMemo(() => {
    const raw = (livePost as any)?.author || {};
    return {
      id: raw.id || (livePost as any)?.authorId || (livePost as any)?.author_id || '',
      name: raw.name || (livePost as any)?.authorName || (livePost as any)?.author_name || 'Unknown',
      username: raw.username || (livePost as any)?.authorUsername || (livePost as any)?.author_username || '',
      avatarUrl: raw.avatarUrl || raw.avatar_url || (livePost as any)?.authorAvatar || (livePost as any)?.author_avatar,
      avatar: raw.avatar || '👾',
    };
  }, [livePost]);
  const isOwnPost = !!author.id && author.id === currentUser?.id;

  // ── Back handling ─────────────────────────────────────────────────
  // A tray-tap / deep link can cold-start the app STRAIGHT into this post with
  // nothing beneath it in the root stack — in that case goBack() has nowhere to
  // go and the button silently does nothing. Fall back to the Home tab so the
  // user always lands somewhere (instead of a dead button or the app exiting).
  const handleBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      (navigation as any).reset({
        index: 0,
        routes: [{ name: "Main", params: { screen: "Home" } }],
      });
    }
  }, [navigation]);

  // Android hardware back — same fallback. Only intercept when there's no
  // stack beneath; otherwise let the native stack pop normally.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!navigation.canGoBack()) {
        handleBack();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [handleBack, navigation]);

  // ── Fresh state on mount + view counting ──────────────────────────
  useEffect(() => {
    postsService.recordView(initialPost.id).catch(() => {});
    postsService
      .getPost(initialPost.id)
      .then((res) => {
        const fresh = res?.data;
        if (!fresh || interactedRef.current) return;
        setLivePost((prev: any) => ({
          // Authoritative server copy — unless the user already acted, in
          // which case local optimistic state wins (handled above).
          ...fresh,
          comments: fresh.comments ?? (fresh as any)?.commentsCount ?? prev.comments ?? 0,
        }));
      })
      .catch((err) => {
        if (err.response?.status === 403) {
          const msg = err.response?.data?.message || "";
          if (msg.includes("private account") || msg.includes("follow the post author")) {
            setAccessRestricted("private_user");
          } else if (msg.includes("private community") || msg.includes("community post")) {
            setAccessRestricted("private_community");
          }
        }
      })
      .finally(() => {
        setIsCheckingAccess(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPost.id]);

  // ── Cache sync — feed / bookmarks / profile cards stay in step ────
  const patchCachedPosts = useCallback((postId: string, patch: (p: any) => any) => {
    queryClient.getQueryCache().findAll().forEach((query) => {
      const key = query.queryKey;
      if (!Array.isArray(key) || key.length === 0) return;
      if (key[0] !== 'feed' && key[0] !== 'bookmarks' && key[0] !== 'profile') return;
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
  }, [queryClient]);

  const removeFromCaches = useCallback((postId: string) => {
    queryClient.getQueryCache().findAll().forEach((query) => {
      const key = query.queryKey;
      if (!Array.isArray(key) || key.length === 0) return;
      if (key[0] !== 'feed' && key[0] !== 'bookmarks' && key[0] !== 'profile') return;
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
  }, [queryClient]);

  // ── Card callbacks (PostCard calls these; it renders the UI) ──────
  const handleLike = useCallback((postId: string) => {
    // Snapshot the pre-toggle state once (from the ref, not inside the updater)
    // so the API call + rollback stay consistent even if React re-runs updaters.
    const wasLiked = !!livePostRef.current?.isLiked;
    const base = livePostRef.current?.likes ?? livePostRef.current?.likesCount ?? 0;
    const next = wasLiked ? Math.max(0, base - 1) : base + 1;
    interactedRef.current = true;
    setLivePost((p: any) => ({ ...p, isLiked: !wasLiked, likes: next, likesCount: next }));
    postsService.toggleLike(postId, wasLiked).catch(() => {
      setLivePost((q: any) => ({
        ...q,
        isLiked: wasLiked,
        likes: Math.max(0, next + (wasLiked ? 1 : -1)),
        likesCount: Math.max(0, next + (wasLiked ? 1 : -1)),
      }));
    });
    patchCachedPosts(postId, (cp: any) => ({
      ...cp,
      isLiked: !wasLiked,
      likes: (cp.likes ?? cp.likesCount ?? 0) + (wasLiked ? -1 : 1),
      likesCount: (cp.likes ?? cp.likesCount ?? 0) + (wasLiked ? -1 : 1),
    }));
  }, [patchCachedPosts]);

  const handleSave = useCallback((postId: string) => {
    const wasSaved = !!livePostRef.current?.isSaved;
    interactedRef.current = true;
    setLivePost((p: any) => ({ ...p, isSaved: !wasSaved }));
    postsService.toggleSave(postId, wasSaved).catch(() => {
      setLivePost((q: any) => ({ ...q, isSaved: wasSaved }));
    });
    patchCachedPosts(postId, (cp: any) => ({ ...cp, isSaved: !wasSaved }));
  }, [patchCachedPosts]);

  // PostCard already flips caches + calls the API; here we only mirror the
  // result into the card's own prop so its icon/count stay live.
  const handleReposted = useCallback((repost: any) => {
    interactedRef.current = true;
    const reposted = !!repost;
    setLivePost((p: any) => {
      const wasReposted = !!p?.repostedByMe;
      const base = p?.shares ?? p?.sharesCount ?? 0;
      const delta = reposted === wasReposted ? 0 : reposted ? 1 : -1;
      return {
        ...p,
        repostedByMe: reposted,
        shares: Math.max(0, base + delta),
        sharesCount: Math.max(0, base + delta),
      };
    });
  }, []);

  // Comment bubble → reveal/focus the thread right below the card.
  const handleComment = useCallback(() => {
    composerRef.current?.focus?.();
  }, []);

  const handleAuthorPress = useCallback(() => {
    if (!author.id) return;
    // push (not navigate): the profile opens above this page, so back returns
    // to the post — navigate could jump to an older profile instance and
    // skip the whole back stack.
    (navigation as any).push('UserProfile', { user: (livePost as any)?.author || {} });
  }, [author.id, livePost, navigation]);

  const handleDelete = useCallback(() => {
    themedAlert(
      'Delete post',
      'Are you sure you want to delete this post? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await postsService.deletePost(initialPost.id);
              removeFromCaches(initialPost.id);
              handleBack();
            } catch (e) {
              themedAlert('Error', 'Could not delete the post. Please try again.');
            }
          },
        },
      ],
    );
  }, [initialPost.id, navigation, removeFromCaches, handleBack]);

  const handleReport = useCallback(() => {
    themedAlert('Reported', 'Thank you. This post has been reported for review.');
  }, []);

  // Comments streaming in below keep the card's count live.
  const handleCountChange = useCallback((delta: number) => {
    setLivePost((p: any) => {
      const base = p?.comments ?? p?.commentsCount ?? 0;
      const next = Math.max(0, base + delta);
      return { ...p, comments: next, commentsCount: next };
    });
  }, []);

  const handleShare = useCallback(async () => {
    try {
      const shareTitle = (livePost as any)?.title || `${author.name}'s Post`;
      const appUrl = `https://taddlebox.com/post/${initialPost.id}`;
      await Share.share({
        message: `${shareTitle}\n\n${appUrl}`,
        url: appUrl,
        title: shareTitle,
      }, { dialogTitle: 'Share Post' });
    } catch (e) {
      console.warn('Failed to share', e);
    }
  }, [livePost, author.name, initialPost.id]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <StatusBar style={isDark ? 'light' : 'dark'} />

        {/* Sticky header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerBtn} onPress={handleBack}>
            <Ionicons name="arrow-back" size={23} color={colors.text.primary} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerName} numberOfLines={1}>{author.name}</Text>
            {author.username ? (
              <Text style={styles.headerHandle} numberOfLines={1}>@{author.username}</Text>
            ) : null}
          </View>
          {/* Share lives in the card's own action row below — no duplicate here. */}
        </View>

        {isCheckingAccess ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            {/* Loading placeholder while checking access */}
          </View>
        ) : accessRestricted ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl }}>
            
            {/* Clickable Profile Block for private users */}
            {accessRestricted === 'private_user' && (
              <TouchableOpacity 
                onPress={handleAuthorPress} 
                style={{ alignItems: 'center', marginBottom: spacing.lg }}
                activeOpacity={0.7}
              >
                <View style={{
                  width: 80, height: 80, borderRadius: 40, backgroundColor: colors.bg.elevated, 
                  alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: spacing.md,
                  borderWidth: 1, borderColor: colors.border
                }}>
                  {author.avatarUrl ? (
                    <Image source={{ uri: author.avatarUrl }} style={{ width: 80, height: 80 }} />
                  ) : (
                    <Text style={{ fontSize: 32 }}>{author.avatar}</Text>
                  )}
                </View>
                <Text style={{ fontSize: fontSizes.xl, fontWeight: '700', color: colors.text.primary }}>
                  {author.name}
                </Text>
                {author.username ? (
                  <Text style={{ fontSize: fontSizes.md, color: colors.text.muted, marginTop: 4 }}>
                    @{author.username}
                  </Text>
                ) : null}
              </TouchableOpacity>
            )}

            <Ionicons name="lock-closed-outline" size={54} color={colors.border} />
            
            {accessRestricted === 'private_community' && (
              <Text style={{ fontSize: fontSizes.xl, fontWeight: '700', color: colors.text.primary, marginTop: spacing.md, textAlign: 'center' }}>
                Access Restricted
              </Text>
            )}

            <Text style={{ fontSize: fontSizes.md, color: colors.text.muted, marginTop: spacing.sm, textAlign: 'center', lineHeight: 22, marginBottom: spacing.xl }}>
              {accessRestricted === 'private_user' 
                ? `This account is private. Follow @${author.username} to view and interact with their posts.`
                : `This community is private. Join to view and interact with its posts.`}
            </Text>

            {accessRestricted === 'private_user' && (
              <TouchableOpacity
                style={{
                  backgroundColor: followRequested ? colors.bg.elevated : colors.primary,
                  paddingVertical: 12,
                  paddingHorizontal: 24,
                  borderRadius: 24,
                  borderWidth: followRequested ? 1 : 0,
                  borderColor: colors.border,
                }}
                disabled={followRequested || !author.username}
                onPress={async () => {
                  try {
                    await userService.followUser(author.username);
                    setFollowRequested(true);
                  } catch (e) {
                    themedAlert('Error', 'Failed to request follow.');
                  }
                }}
              >
                <Text style={{ color: followRequested ? colors.text.primary : '#fff', fontWeight: '700', fontSize: fontSizes.md }}>
                  {followRequested ? 'Requested' : 'Request to Follow'}
                </Text>
              </TouchableOpacity>
            )}

            {accessRestricted === 'private_community' && (
              <TouchableOpacity
                style={{
                  backgroundColor: joinRequested ? colors.bg.elevated : colors.primary,
                  paddingVertical: 12,
                  paddingHorizontal: 24,
                  borderRadius: 24,
                  borderWidth: joinRequested ? 1 : 0,
                  borderColor: colors.border,
                }}
                disabled={joinRequested}
                onPress={async () => {
                  const communityId = typeof initialPost.community === 'object' ? (initialPost.community as any).id : typeof initialPost.community === 'string' ? initialPost.community : (initialPost as any).community_id;
                  if (!communityId) {
                    themedAlert('Error', 'Community info missing.');
                    return;
                  }
                  try {
                    await communityService.joinCommunity(communityId);
                    setJoinRequested(true);
                  } catch (e) {
                    themedAlert('Error', 'Failed to request join.');
                  }
                }}
              >
                <Text style={{ color: joinRequested ? colors.text.primary : '#fff', fontWeight: '700', fontSize: fontSizes.md }}>
                  {joinRequested ? 'Requested' : 'Request to Join'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <CommentsThread
            post={initialPost as any}
            composerRef={composerRef}
            focusCommentId={focusCommentId}
            onCountChange={handleCountChange}
            ListHeaderComponent={
              <PostCard
                post={livePost as any}
                isActive
                disableTapNavigation
                fullBleed
                onLike={handleLike}
                onSave={handleSave}
                onComment={handleComment}
                onShare={handleShare}
                onReposted={handleReposted}
                onAuthorPress={handleAuthorPress}
                onDelete={handleDelete}
                onReport={handleReport}
                showDelete={isOwnPost}
              />
            }
          />
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
