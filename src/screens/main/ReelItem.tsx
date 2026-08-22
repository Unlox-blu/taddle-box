/**
 * ReelItem — Single full-screen reel cell.
 *
 * Three layers stacked via StyleSheet.absoluteFill:
 *   1. Content   — full-screen post content (image/video/text/poll)
 *   2. Top overlay  — author identity + XP pill + ⋯ menu
 *   3. Bottom overlay — gradient scrim + horizontal action row
 *
 * All overlays are position:absolute and do NOT consume layout space, so
 * media / text content uses 100% of the screen area.
 */
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  Dimensions,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fontSizes, spacing } from '../../theme';
import { useThemeColors } from '../../context/ThemeContext';
import type { Post } from '../../types';
import { ActiveVideo, RollingText } from '../../components/home/postcard/shared';
import PollBlock from '../../components/common/PollBlock';
import PostMenuSheet from '../../components/home/PostMenuSheet';
import { themedAlert } from '../../components/common/ThemedAlert';
import { warn } from '../../utils/logger';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// ─── formatCount ──────────────────────────────────────────────────────────────
function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ─── Props ────────────────────────────────────────────────────────────────────
export interface ReelItemProps {
  post: Post;
  isActive: boolean;
  onLike: (id: string) => void;
  onSave: (id: string) => void;
  onCommentPress: (post: Post) => void;
  onAuthorPress: (post: Post) => void;
  onDelete: (post: Post) => void;
  onReport: (post: Post) => void;
  onShare?: () => void;
  showDelete: boolean;
}

// ─── DoubleTapLike ────────────────────────────────────────────────────────────
function DoubleTapLike({
  onDoubleTap,
}: {
  onDoubleTap: () => void;
}) {
  const lastTap = useRef(0);
  const heartScale = useRef(new Animated.Value(0)).current;
  const heartOpacity = useRef(new Animated.Value(0)).current;
  const [tapPos, setTapPos] = useState({ x: SCREEN_W / 2, y: SCREEN_H / 2 });

  const handlePress = (e: any) => {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      setTapPos({
        x: e.nativeEvent.locationX,
        y: e.nativeEvent.locationY,
      });
      onDoubleTap();
      // Heart animation
      Animated.sequence([
        Animated.parallel([
          Animated.spring(heartScale, {
            toValue: 1,
            tension: 60,
            friction: 5,
            useNativeDriver: true,
          }),
          Animated.timing(heartOpacity, {
            toValue: 1,
            duration: 100,
            useNativeDriver: true,
          }),
        ]),
        Animated.delay(400),
        Animated.timing(heartOpacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start(() => heartScale.setValue(0));
    }
    lastTap.current = now;
  };

  return (
    <>
      <TouchableWithoutFeedback onPress={handlePress}>
        <View style={StyleSheet.absoluteFill} />
      </TouchableWithoutFeedback>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.heartBurst,
          {
            left: tapPos.x - 48,
            top: tapPos.y - 48,
            opacity: heartOpacity,
            transform: [{ scale: heartScale }],
          },
        ]}
      >
        <Text style={{ fontSize: 96 }}>❤️</Text>
      </Animated.View>
    </>
  );
}

// ─── ReelContent ──────────────────────────────────────────────────────────────
function ReelContent({ post, isActive, onToggleMute, isMuted }: { post: Post; isActive: boolean; onToggleMute?: () => void; isMuted?: boolean }) {
  const colors = useThemeColors();
  const allMedia = (post as any).media || [];
  const firstMedia = allMedia[0];
  const isVideo =
    firstMedia?.media_type === 'video' ||
    firstMedia?.type === 'video' ||
    post.type === 'video';
  const isAudio = firstMedia?.media_type === 'audio';
  const mediaUrl = firstMedia?.media_url || post.mediaUri || post.image;

  // Calculate aspect-ratio-preserving dimensions for the media
  const getMediaDimensions = () => {
    const w = firstMedia?.width || 1080;
    const h = firstMedia?.height || 1080;
    const ratio = w / h;
    // Fit within screen width, cap height at screen height
    let displayW = SCREEN_W;
    let displayH = SCREEN_W / ratio;
    if (displayH > SCREEN_H) {
      displayH = SCREEN_H;
      displayW = SCREEN_H * ratio;
    }
    return { width: displayW, height: displayH };
  };
  const dims = getMediaDimensions();

  if (isVideo && mediaUrl) {
    return (
      <TouchableWithoutFeedback onPress={onToggleMute}>
        <View style={{ width: SCREEN_W, height: SCREEN_H, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
          {isActive ? (
            <ActiveVideo
              url={mediaUrl}
              width={dims.width}
              height={dims.height}
              muted={!!isMuted}
              loop
            />
          ) : (
            <Image
              source={{ uri: firstMedia?.preview_url || mediaUrl }}
              style={{ width: dims.width, height: dims.height }}
              contentFit="contain"
            />
          )}
          {/* Mute indicator */}
          {isActive && (
            <View style={[styles.muteIndicator, { opacity: isMuted ? 0.8 : 0 }]}>
              <Ionicons name="volume-mute" size={28} color="#fff" />
            </View>
          )}
        </View>
      </TouchableWithoutFeedback>
    );
  }

  if (isAudio && mediaUrl) {
    // Audio-only post: show cover art + audio player
    return (
      <TouchableWithoutFeedback onPress={onToggleMute}>
        <View style={{ width: SCREEN_W, height: SCREEN_H, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
          {firstMedia?.preview_url ? (
            <Image
              source={{ uri: firstMedia.preview_url }}
              style={{ width: SCREEN_W, height: SCREEN_W }}
              contentFit="cover"
            />
          ) : (
            <LinearGradient colors={['#1e0a3c', '#070714']} style={{ width: SCREEN_W, height: SCREEN_H, justifyContent: 'center', alignItems: 'center' }}>
              <Ionicons name="musical-notes" size={64} color={colors.primaryLight} />
            </LinearGradient>
          )}
          {/* Audio waveform indicator */}
          <View style={styles.audioIndicator}>
            <Ionicons name="musical-notes" size={20} color="#fff" />
            <Text style={styles.audioLabel}>{isMuted ? 'Tap to unmute' : 'Playing'}</Text>
          </View>
        </View>
      </TouchableWithoutFeedback>
    );
  }

  if (mediaUrl) {
    // Image post
    return (
      <TouchableWithoutFeedback onPress={onToggleMute}>
        <View style={{ width: SCREEN_W, height: SCREEN_H, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
          <Image
            source={{ uri: mediaUrl }}
            style={{ width: dims.width, height: dims.height }}
            contentFit="contain"
            transition={200}
          />
        </View>
      </TouchableWithoutFeedback>
    );
  }

  // Text / poll — branded gradient background
  const gradientColors: [string, string] =
    post.type === 'poll'
      ? ['#1A1A3A', '#0E0E24']
      : ['#1e0a3c', '#070714'];

  return (
    <LinearGradient
      colors={gradientColors}
      style={{ width: SCREEN_W, height: SCREEN_H, justifyContent: 'center', alignItems: 'center' }}
    >
      {(post as any).title ? (
        <Text style={[styles.postTitle, { color: '#F1F5F9' }]} numberOfLines={4}>
          {(post as any).title}
        </Text>
      ) : null}
      {post.type === 'poll' && (post as any).pollData ? (
        <View style={{ width: SCREEN_W - spacing.xl * 2 }}>
          <PollBlock
            poll={(post as any).pollData}
            myVote={(post as any).myPollVote ?? null}
          />
        </View>
      ) : (
        <View style={styles.textContent}>
          <Text style={[styles.postText, { color: '#F1F5F9' }]}>
            {post.content}
          </Text>
        </View>
      )}
    </LinearGradient>
  );
}

// ─── RollingSecondaryText ─────────────────────────────────────────────────────
function RollingSecondaryText({ post }: { post: Post }) {
  const author = (post as any).author || {};
  const xp = author.xp ?? author.totalXp ?? 0;
  const org = author.organization || author.bio || '';
  const handle = author.username || author.handle || '';

  const items = useMemo(() => {
    const lines: React.ReactNode[] = [];
    if (org) lines.push(<Text style={styles.secondaryText}>{org}</Text>);
    if (xp > 0) lines.push(<Text style={styles.secondaryText}>{formatCount(xp)} XP</Text>);
    if (handle) lines.push(<Text style={styles.secondaryText}>@{handle}</Text>);
    return lines.length > 0 ? lines : [<Text style={styles.secondaryText}>Taddlebox</Text>];
  }, [org, xp, handle]);

  return <RollingText items={items} isActive />;
}

// ─── ReelTopOverlay ───────────────────────────────────────────────────────────
function ReelTopOverlay({
  post,
  onAuthorPress,
  onDelete,
  onReport,
  onSave,
  onShare,
  showDelete,
  insetTop,
}: {
  post: Post;
  onAuthorPress: () => void;
  onDelete: () => void;
  onReport: () => void;
  onSave: () => void;
  onShare: () => void;
  showDelete: boolean;
  insetTop: number;
}) {
  const colors = useThemeColors();
  const [showMenu, setShowMenu] = useState(false);

  const author = useMemo(() => {
    const raw = (post as any).author || {};
    return {
      name: raw.name || 'Unknown',
      avatarUrl: raw.avatar_url?.cloudfront_url || raw.avatar_url,
      avatar: raw.avatar || '👾',
      xp: raw.xp ?? raw.totalXp ?? 0,
    };
  }, [post]);

  const menuOptions = useMemo(() => {
    const base = [
      {
        icon: 'share-outline',
        label: 'Share',
        onPress: onShare,
      },
      {
        icon: (post as any).isSaved ? 'bookmark' : 'bookmark-outline',
        label: (post as any).isSaved ? 'Unsave' : 'Save',
        onPress: onSave,
      },
      {
        icon: 'eye-off-outline',
        label: 'Not Interested',
        onPress: () => {},
      },
      {
        icon: 'link-outline',
        label: 'Copy Link',
        onPress: () => {
          // TODO: clipboard
        },
      },
    ];
    if (showDelete) {
      base.push({
        icon: 'trash-outline',
        label: 'Delete',
        color: colors.danger,
        onPress: onDelete,
      } as any);
    } else {
      base.push({
        icon: 'flag-outline',
        label: 'Report',
        color: colors.danger,
        onPress: onReport,
      } as any);
    }
    return base;
  }, [post, showDelete, onDelete, onReport, onSave, onShare, colors.danger]);

  return (
    <View
      pointerEvents="box-none"
      style={[styles.topOverlay, { top: insetTop + 8 }]}
    >
      {/* Left: Avatar + Name + Rolling secondary */}
      <TouchableOpacity
        style={styles.authorRow}
        onPress={onAuthorPress}
        activeOpacity={0.85}
      >
        <View style={styles.avatarWrap}>
          {author.avatarUrl ? (
            <Image
              source={{ uri: author.avatarUrl }}
              style={styles.avatar}
              contentFit="cover"
            />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={{ fontSize: 18 }}>{author.avatar}</Text>
            </View>
          )}
          {/* Online dot placeholder */}
          <View style={[styles.onlineDot, { backgroundColor: colors.success }]} />
        </View>

        <View style={styles.authorInfo}>
          <Text style={styles.authorName} numberOfLines={1}>
            {author.name}
          </Text>
          <RollingSecondaryText post={post} />
        </View>
      </TouchableOpacity>

      {/* Right: XP pill + ⋯ */}
      <View style={styles.topRight}>
        {author.xp > 0 && (
          <View style={styles.xpPill}>
            <Text style={styles.xpPillText}>⚡ {formatCount(author.xp)} XP</Text>
          </View>
        )}
        <TouchableOpacity
          style={styles.menuBtn}
          onPress={() => setShowMenu(true)}
          hitSlop={10}
        >
          <Ionicons name="ellipsis-vertical" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      <PostMenuSheet
        visible={showMenu}
        onClose={() => setShowMenu(false)}
        options={menuOptions}
      />
    </View>
  );
}

// ─── ReelBottomActions ────────────────────────────────────────────────────────
function ReelBottomActions({
  post,
  onLike,
  onComment,
  onSave,
  onShare,
  hasMedia,
  insetBottom,
}: {
  post: Post;
  onLike: () => void;
  onComment: () => void;
  onSave: () => void;
  onShare: () => void;
  hasMedia: boolean;
  insetBottom: number;
}) {
  const colors = useThemeColors();
  const likeAnim = useRef(new Animated.Value(1)).current;

  const handleLike = useCallback(() => {
    Animated.sequence([
      Animated.spring(likeAnim, {
        toValue: 1.35,
        tension: 200,
        friction: 5,
        useNativeDriver: true,
      }),
      Animated.spring(likeAnim, {
        toValue: 1,
        tension: 200,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();
    onLike();
  }, [onLike, likeAnim]);

  const likes = (post as any).likes ?? (post as any).likesCount ?? 0;
  const comments = (post as any).comments ?? (post as any).commentsCount ?? 0;
  const isLiked = !!post.isLiked;
  const isSaved = !!(post as any).isSaved;

  // Scrim gradient: taller + darker for media, shorter for text
  const scrimColors = hasMedia
    ? (['transparent', 'rgba(0,0,0,0.65)'] as const)
    : (['transparent', 'rgba(0,0,0,0.38)'] as const);
  const scrimHeight = hasMedia ? SCREEN_H * 0.28 : SCREEN_H * 0.15;

  return (
    <>
      {/* Bottom gradient scrim */}
      <LinearGradient
        colors={scrimColors}
        style={[styles.bottomScrim, { height: scrimHeight }]}
        pointerEvents="none"
      />

      {/* Action row */}
      <View
        style={[
          styles.bottomActions,
          { bottom: insetBottom + 16 },
        ]}
        pointerEvents="box-none"
      >
        {/* Like */}
        <TouchableOpacity onPress={handleLike} style={styles.actionBtn} activeOpacity={0.7}>
          <Animated.View style={{ transform: [{ scale: likeAnim }] }}>
            <Ionicons
              name={isLiked ? 'heart' : 'heart-outline'}
              size={28}
              color={isLiked ? colors.primaryLight : colors.primaryLight}
            />
          </Animated.View>
          <Text style={[styles.actionCount, { color: colors.primaryLight }]}>
            {formatCount(likes)}
          </Text>
        </TouchableOpacity>

        {/* Comment */}
        <TouchableOpacity onPress={onComment} style={styles.actionBtn} activeOpacity={0.7}>
          <Ionicons name="chatbubble-outline" size={26} color={colors.primaryLight} />
          <Text style={[styles.actionCount, { color: colors.primaryLight }]}>{formatCount(comments)}</Text>
        </TouchableOpacity>

        {/* Save */}
        <TouchableOpacity onPress={onSave} style={styles.actionBtn} activeOpacity={0.7}>
          <Ionicons
            name={isSaved ? 'bookmark' : 'bookmark-outline'}
            size={26}
            color={isSaved ? colors.primaryLight : colors.primaryLight}
          />
        </TouchableOpacity>

        {/* Share */}
        <TouchableOpacity onPress={onShare} style={styles.actionBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-redo-outline" size={26} color={colors.primaryLight} />
        </TouchableOpacity>
      </View>
    </>
  );
}

// ─── ReelItem (main export) ───────────────────────────────────────────────────
export default React.memo(function ReelItem({
  post,
  isActive,
  onLike,
  onSave,
  onCommentPress,
  onAuthorPress,
  onDelete,
  onReport,
  onShare: onShareProp,
  showDelete,
}: ReelItemProps) {
  const insets = useSafeAreaInsets();

  // Detect whether this post has real media for scrim sizing
  const allMedia = (post as any).media || [];
  const hasMedia =
    allMedia.length > 0 ||
    !!post.mediaUri ||
    (post.type === 'image' && !!post.image) ||
    post.type === 'video';
  const [isMuted, setIsMuted] = useState(true);

  const author = useMemo(() => {
    const raw = (post as any).author || {};
    return {
      name: raw.name || 'Unknown',
      avatarUrl: raw.avatar_url?.cloudfront_url || raw.avatar_url,
      avatar: raw.avatar || '👾',
      xp: raw.xp ?? raw.totalXp ?? 0,
    };
  }, [post]);

  const handleShare = useCallback(async () => {
    try {
      const shareTitle = (post as any).title || `${author.name}'s Post`;
      const appUrl = `https://taddlebox.com/post/${post.id}`;
      await Share.share({
        message: `${shareTitle}\n\n${appUrl}`,
        url: appUrl,
        title: shareTitle,
      });
    } catch (e) {
      warn('Failed to share', e);
    }
  }, [post, author.name]);

  const handleDelete = useCallback(() => {
    themedAlert(
      'Delete post',
      'Are you sure you want to delete this post? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => onDelete(post),
        },
      ],
    );
  }, [post, onDelete]);

  const handleReport = useCallback(() => {
    themedAlert('Reported', 'Thank you. This post has been reported for review.');
    onReport(post);
  }, [post, onReport]);

  return (
    <View style={[styles.cell, { width: SCREEN_W, height: SCREEN_H }]}>
      {/* ── Layer 1: Content (full screen) ── */}
      <ReelContent post={post} isActive={isActive} isMuted={isMuted} onToggleMute={() => setIsMuted((m) => !m)} />

      {/* ── Layer 2: Top scrim ── */}
      <LinearGradient
        colors={['rgba(0,0,0,0.48)', 'transparent']}
        style={[styles.topScrim, { height: SCREEN_H * 0.22 }]}
        pointerEvents="none"
      />

      {/* ── Layer 2: Top overlay ── */}
      <ReelTopOverlay
        post={post}
        onAuthorPress={() => onAuthorPress(post)}
        onDelete={handleDelete}
        onReport={handleReport}
        onSave={() => onSave(post.id)}
        onShare={onShareProp || (() => handleShare())}
        showDelete={showDelete}
        insetTop={insets.top}
      />

      {/* ── Layer 3: Double-tap gesture + heart burst ── */}
      <DoubleTapLike onDoubleTap={() => onLike(post.id)} />

      {/* ── Layer 3: Bottom scrim + actions ── */}
      <ReelBottomActions
        post={post}
        onLike={() => onLike(post.id)}
        onComment={() => onCommentPress(post)}
        onSave={() => onSave(post.id)}
        onShare={onShareProp || (() => handleShare())}
        hasMedia={hasMedia}
        insetBottom={insets.bottom}
      />
    </View>
  );
});

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  cell: {
    overflow: 'hidden',
  },

  // Content
  textContent: {
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
  },
  postText: {
    fontSize: fontSizes.xl,
    fontWeight: '500',
    lineHeight: 30,
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  postTitle: {
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
    marginBottom: 16,
    lineHeight: 36,
  },
  muteIndicator: {
    position: 'absolute',
    alignSelf: 'center',
    top: '45%',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 28,
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  audioIndicator: {
    position: 'absolute',
    bottom: 100,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  audioLabel: {
    color: '#fff',
    fontSize: fontSizes.sm,
    fontWeight: '600',
  },

  // Heart burst (double-tap)
  heartBurst: {
    position: 'absolute',
    width: 96,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
  },

  // Top scrim + overlay
  topScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  topOverlay: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },

  // Author identity
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 8,
  },
  avatarWrap: {
    position: 'relative',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.45)',
  },
  avatarFallback: {
    backgroundColor: 'rgba(124,58,237,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  onlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.6)',
  },
  authorInfo: {
    flex: 1,
    gap: 1,
  },
  authorName: {
    fontSize: fontSizes.md,
    fontWeight: '800',
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  secondaryText: {
    fontSize: fontSizes.xs,
    color: 'rgba(255,255,255,0.80)',
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },

  // Top-right: XP pill + menu
  topRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 2,
  },
  xpPill: {
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  xpPillText: {
    fontSize: fontSizes.xs,
    fontWeight: '700',
    color: '#FBBF24',
  },
  menuBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Bottom
  bottomScrim: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  bottomActions: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 28,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionCount: {
    fontSize: fontSizes.sm,
    fontWeight: '700',
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});
