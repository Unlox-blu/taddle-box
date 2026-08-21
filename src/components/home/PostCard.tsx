import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
  Animated,
  Dimensions,
  Modal,
  ScrollView,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQueryClient } from "@tanstack/react-query";
import { radii, fontSizes, spacing, type ColorPalette } from "../../theme";
import { useThemeColors } from "../../context/ThemeContext";
import { useAuth } from "../../context/AuthContext";
import type { Post, HomeStackParamList } from "../../types";
import { xpService } from "../../services/xp.service";
import { postsService } from "../../services/posts.service";
import { queryKeys } from "../../lib/queryKeys";
import PollBlock from "../common/PollBlock";
import { themedAlert } from "../common/ThemedAlert";

// ── Sub-components from postcard/ directory ──────────────────────────────────
import PostHeader from "./postcard/PostHeader";
import type { PostHeaderAuthor } from "./postcard/PostHeader";
import PostMedia from "./postcard/PostMedia";
import PostActions from "./postcard/PostActions";
import {
  FeedVideo,
  formatInstagramTime,
  makePostCardStyles,
} from "./postcard/shared";

const SCREEN_W = Dimensions.get("window").width;
const CARD_W = SCREEN_W - spacing.lg * 2;

interface PostCardProps {
  post: Post;
  onLike?: (id: string) => void;
  onSave?: (id: string) => void;
  onComment?: (post: Post) => void;
  onShare?: (post: Post) => void;
  onAuthorPress?: (post: Post) => void;
  onReposted?: (post: any) => void;
  isActive?: boolean;
  index?: number;
  showViews?: boolean;
  disableTapNavigation?: boolean;
  fullBleed?: boolean;
  onDelete?: (post: Post) => void;
  onReport?: (post: Post) => void;
  showDelete?: boolean;
  preloadVideo?: boolean;
}

export default React.memo(PostCardInner);

function PostCardInner({
  post,
  isActive,
  onLike,
  onSave,
  onComment,
  onShare,
  onAuthorPress,
  onReposted,
  index,
  onDelete,
  onReport,
  showDelete,
  showViews,
  disableTapNavigation,
  fullBleed,
  preloadVideo,
}: PostCardProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => makePostCardStyles(colors), [colors]);
  const scale = useRef(new Animated.Value(1)).current;
  const navigation =
    useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();

  const [showMenu, setShowMenu] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const postId = String(post?.id || "");

  // ── Poll state (shared between card and actions menu) ───────────────────
  const [pollData, setPollData] = useState((post as any)?.pollData || null);
  const [myPollVote, setMyPollVote] = useState<number | null>(
    (post as any)?.myPollVote ?? null,
  );
  useEffect(() => {
    setPollData((post as any)?.pollData || null);
    setMyPollVote((post as any)?.myPollVote ?? null);
  }, [postId]);

  const handlePollVote = useCallback(
    async (optionIndex: number) => {
      if (!postId || !pollData) return;
      try {
        const res = await postsService.castPollVote(postId, optionIndex);
        const data = res?.data;
        if (data?.pollData) setPollData(data.pollData);
        setMyPollVote(data?.myVote ?? null);
      } catch (e: any) {
        themedAlert(
          "Vote Error",
          e?.response?.data?.message || "Could not record your vote.",
        );
      }
    },
    [postId, pollData],
  );

  // ── Author info ─────────────────────────────────────────────────────────
  const author = useMemo<PostHeaderAuthor>(() => {
    const raw = (post as any)?.author || {};
    return {
      id: raw.id || (post as any)?.authorId || (post as any)?.author_id || "",
      name: raw.name || (post as any)?.authorName || (post as any)?.author_name || "Unknown User",
      username: raw.username || (post as any)?.authorUsername || (post as any)?.author_username || "unknown",
      avatarUrl: raw.avatarUrl || raw.avatar_url || (post as any)?.authorAvatar || (post as any)?.author_avatar,
      avatar: raw.avatar || "👾",
      repostsEnabled:
        (raw.repostsEnabled ?? (post as any)?.authorRepostsEnabled ?? (post as any)?.author_reposts_enabled) !== false,
    };
  }, [post]);

  // ── Media dimensions ────────────────────────────────────────────────────
  const mediaW = fullBleed ? SCREEN_W : CARD_W;
  const previewH = useMemo(() => {
    const baseW = fullBleed ? SCREEN_W : CARD_W;
    let h = baseW;
    const media = (post as any).media;
    if (media && media.length > 0) {
      let minAspectRatio = 1;
      let hasValidDimensions = false;
      media.forEach((item: any) => {
        if (item.width && item.height) {
          const ratio = item.width / item.height;
          if (!hasValidDimensions || ratio < minAspectRatio) {
            minAspectRatio = ratio;
            hasValidDimensions = true;
          }
        }
      });
      if (hasValidDimensions) {
        h = baseW / minAspectRatio;
        if (h > SCREEN_W * 1.5) h = SCREEN_W * 1.5;
        if (h < SCREEN_W * 0.4) h = SCREEN_W * 0.4;
      }
    }
    return h;
  }, [post, fullBleed]);

  // ── Engagement counts ───────────────────────────────────────────────────
  const displayLikes = post.likes ?? (post as any).likesCount ?? 0;
  const displayComments = post.comments ?? (post as any).commentsCount ?? 0;
  const displayShares = post.shares ?? (post as any).sharesCount ?? 0;

  const communityRepostsEnabled =
    typeof post.community !== "object" || !post.community
      ? true
      : (post.community as any)?.repostsEnabled !== false;

  // ── Double-tap heart ────────────────────────────────────────────────────
  const doubleTapAnim = useRef(new Animated.Value(0)).current;
  const lastTapTime = useRef(0);
  const tapNavTimer = React.useRef<any>(null);

  const handleLike = useCallback(() => {
    Animated.sequence([
      Animated.spring(scale, { toValue: 1.3, useNativeDriver: true, speed: 50 }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 50 }),
    ]).start();
    onLike?.(postId);
  }, [onLike, postId, scale]);

  const handleDoubleTap = useCallback(() => {
    if (!post.isLiked) {
      handleLike();
    }
    doubleTapAnim.setValue(1);
    Animated.sequence([
      Animated.spring(doubleTapAnim, {
        toValue: 1.5,
        friction: 3,
        useNativeDriver: true,
      }),
      Animated.timing(doubleTapAnim, {
        toValue: 0,
        duration: 200,
        delay: 400,
        useNativeDriver: true,
      }),
    ]).start();
  }, [post.isLiked, handleLike, doubleTapAnim]);

  const registerTap = useCallback(
    (onSingleTap: () => void) => {
      const now = Date.now();
      if (now - lastTapTime.current < 300) {
        if (tapNavTimer.current) {
          clearTimeout(tapNavTimer.current);
          tapNavTimer.current = null;
        }
        lastTapTime.current = 0;
        handleDoubleTap();
        return;
      }
      lastTapTime.current = now;
      if (tapNavTimer.current) clearTimeout(tapNavTimer.current);
      tapNavTimer.current = setTimeout(() => {
        tapNavTimer.current = null;
        onSingleTap();
      }, 300);
    },
    [handleDoubleTap],
  );

  const openPostDetail = React.useCallback(() => {
    navigation.push("PostDetail", { post } as any);
  }, [navigation, post]);

  const handleBodyTap = () => {
    registerTap(() => {
      if (disableTapNavigation) return;
      openPostDetail();
    });
  };

  // ── Text rendering ──────────────────────────────────────────────────────
  const allMedia = (post as any).media || [];
  const hasMedia = allMedia.length > 0 || !!post.mediaUri || (post.type === "image" && !!post.image);
  const contentLimitLines = hasMedia ? 2 : 10;
  const contentCharLimit = hasMedia ? 80 : 350;

  const renderParsedText = (text: string, baseStyle: any, lines?: number) => {
    if (!text) return null;
    return (
      <Text style={baseStyle} numberOfLines={lines}>
        {text
          .split(
            /(\{@\}\[[^\]]+\]\([^)]+\)|\{#\}\[[^\]]+\]\([^)]+\)|\{c\/\}\[[^\]]+\]\([^)]+\)|<mark>[^<]+<\/mark>|@\w+|#\w+|c\/\w+)/g,
          )
          .map((part: string, i: number) => {
            const mentionMatch = part.match(/^\{@\}\[([^\]]+)\]\(([^)]+)\)$/);
            if (mentionMatch) {
              const name = mentionMatch[1];
              const id = mentionMatch[2];
              return (
                <Text
                  key={i}
                  style={{ color: colors.primaryLight, fontWeight: "700" }}
                  onPress={() =>
                    navigation.push("UserProfile", {
                      user: { id, name, username: name, handle: name, avatar: "", level: 1, xp: 0, xpToNext: 100 },
                    } as any)
                  }
                >
                  @{name}
                </Text>
              );
            }
            const hashMatch = part.match(/^\{#\}\[([^\]]+)\]\(([^)]+)\)$/);
            if (hashMatch) {
              return (
                <Text
                  key={i}
                  style={{ color: colors.cyanLight }}
                  onPress={() => navigation.navigate("Search", { query: hashMatch[1], tab: "hashtags" })}
                >
                  #{hashMatch[1]}
                </Text>
              );
            }
            const communityMatch = part.match(/^\{c\/\}\[([^\]]+)\]\(([^)]+)\)$/);
            if (communityMatch) {
              return (
                <Text
                  key={i}
                  style={{ color: colors.cyanLight, fontWeight: "700" }}
                  onPress={() =>
                    navigation.navigate("Community" as any, {
                      screen: "CommunityDetail",
                      params: { communitySlug: communityMatch[1] },
                    } as any)
                  }
                >
                  c/{communityMatch[1]}
                </Text>
              );
            }
            const plainCommunityMatch = part.match(/^c\/([a-z0-9_]+)$/i);
            if (plainCommunityMatch) {
              return (
                <Text
                  key={i}
                  style={{ color: colors.cyanLight, fontWeight: "700" }}
                  onPress={() =>
                    navigation.navigate("Community" as any, {
                      screen: "CommunityDetail",
                      params: { communitySlug: plainCommunityMatch[1] },
                    } as any)
                  }
                >
                  c/{plainCommunityMatch[1]}
                </Text>
              );
            }
            if (part.startsWith("@")) {
              return (
                <Text
                  key={i}
                  style={{ color: colors.primaryLight, fontWeight: "700" }}
                  onPress={() =>
                    navigation.push("UserProfile", {
                      user: { id: part.slice(1), name: part.slice(1), username: part.slice(1), handle: part.slice(1), avatar: "", level: 1, xp: 0, xpToNext: 100 },
                    } as any)
                  }
                >
                  {part}
                </Text>
              );
            }
            if (part.startsWith("<mark>") && part.endsWith("</mark>")) {
              return (
                <Text key={i} style={{ backgroundColor: colors.primaryLight + "40", fontWeight: "700" }}>
                  {part.slice(6, -7)}
                </Text>
              );
            }
            if (part.startsWith("#")) {
              return (
                <Text
                  key={i}
                  style={{ color: colors.cyanLight }}
                  onPress={() => navigation.navigate("Search", { query: part.replace("#", ""), tab: "hashtags" })}
                >
                  {part}
                </Text>
              );
            }
            return <Text key={i}>{part}</Text>;
          })}
      </Text>
    );
  };

  // ── Repost cache logic ──────────────────────────────────────────────────
  const flipRepostInCaches = useCallback(
    (nextReposted: boolean, deltaShares: number) => {
      const apply = (query: any) => {
        queryClient.setQueryData(query.queryKey, (old: any) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page: any[]) =>
              page.map((p) => {
                if (p?.id !== postId) return p;
                const current = p.shares ?? p.sharesCount ?? 0;
                return {
                  ...p,
                  repostedByMe: nextReposted,
                  shares: Math.max(0, current + deltaShares),
                  sharesCount: Math.max(0, current + deltaShares),
                };
              }),
            ),
          };
        });
      };
      queryClient.getQueryCache().findAll({ queryKey: queryKeys.feed }).forEach(apply);
      queryClient.getQueryCache().findAll({ queryKey: ["bookmarks"] }).forEach(apply);
      queryClient.getQueryCache().findAll({ queryKey: ["profile"] }).forEach(apply);
      queryClient.getQueryCache().findAll({ queryKey: ["community"] }).forEach(apply);
      queryClient.getQueryCache().findAll({ queryKey: ["search"] }).forEach(apply);
    },
    [queryClient, postId],
  );

  // ── Open post thread (for repost preview) ───────────────────────────────
  const openPostThread = useCallback(
    async (target: Post) => {
      const targetId = String((target as any)?.repostOfId || "");
      const root = targetId ? await resolveRootPost(targetId) : null;
      const dest = root && !root?.repostOfId ? root : target;
      navigation.push("PostDetail", { post: dest as Post } as any);
    },
    [navigation],
  );

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <TouchableWithoutFeedback onPress={handleBodyTap}>
    <View
      style={[
        styles.card,
        fullBleed && styles.cardFullBleed,
        { zIndex: showMenu ? 99 : 1, elevation: showMenu ? 99 : 1 },
      ]}
    >
      <PostHeader
        post={post}
        author={author}
        colors={colors}
        styles={styles}
        onAuthorPress={onAuthorPress}
        onMenuToggle={() => setShowMenu((v) => !v)}
        index={index}
        isActive={isActive}
      />

      {/* Body text */}
      <TouchableWithoutFeedback onPress={handleBodyTap}>
        <View style={[styles.body, { paddingTop: 0 }]}>
          {!!(post as any).title &&
            renderParsedText(
              (post as any).title,
              styles.title,
              isExpanded ? undefined : 2,
            )}
          {!!post.content &&
            renderParsedText(
              (post as any).highlight_content || post.content,
              styles.content,
              isExpanded ? undefined : contentLimitLines,
            )}

          {!isExpanded &&
            Boolean(
              ((post as any).title && (post as any).title.length > 80) ||
                (post.content && post.content.length > contentCharLimit),
            ) && (
              <TouchableOpacity
                onPress={() => setIsExpanded(true)}
                style={{ marginTop: -4, marginBottom: 8 }}
                activeOpacity={0.7}
              >
                <Text style={{ color: colors.text.muted, fontSize: fontSizes.sm, fontWeight: "600" }}>
                  Read more...
                </Text>
              </TouchableOpacity>
            )}

          {/* Reposted original preview */}
          {(post as any).repostOfId ? (
            <RepostedPostCard
              postId={(post as any).repostOfId}
              wrapperId={post.id}
              isActive={isActive ?? true}
              onOpen={(orig) => openPostThread(orig as Post)}
              onTap={(singleTap) => registerTap(singleTap)}
            />
          ) : null}
        </View>
      </TouchableWithoutFeedback>

      {/* Media */}
      <PostMedia
        post={post}
        mediaW={mediaW}
        previewH={previewH}
        isActive={isActive ?? false}
        colors={colors}
        styles={styles}
        onBodyTap={handleBodyTap}
        onVideoDuration={(ms) => {}}
        preloadVideo={preloadVideo}
      />

      {/* Poll */}
      {pollData ? (
        <PollBlock poll={pollData} myVote={myPollVote} onVote={handlePollVote} embedded inset />
      ) : null}

      {/* Actions */}
      <PostActions
        post={post}
        postId={postId}
        author={author}
        displayLikes={displayLikes}
        displayComments={displayComments}
        displayShares={displayShares}
        onLike={handleLike}
        onComment={onComment}
        onShare={onShare}
        onSave={onSave}
        onReposted={onReposted}
        showViews={showViews}
        colors={colors}
        styles={styles}
        flipRepostInCaches={flipRepostInCaches}
        showMenu={showMenu}
        onMenuToggle={() => setShowMenu((v) => !v)}
        onDelete={onDelete}
        onReport={onReport}
        showDelete={showDelete}
        onCloseMenu={() => setShowMenu(false)}
      />

      {/* Double Tap Heart Overlay */}
      <Animated.View
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: 0,
          right: 0,
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
          opacity: doubleTapAnim.interpolate({
            inputRange: [0, 1, 1.5],
            outputRange: [0, 1, 1],
          }),
          transform: [{ scale: doubleTapAnim }],
          zIndex: 10,
        }}
      >
        <Ionicons
          name="heart"
          size={100}
          color={colors.primaryLight}
          style={{
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 5,
          }}
        />
      </Animated.View>
    </View>
    </TouchableWithoutFeedback>
  );
}

// ── Repost cache ────────────────────────────────────────────────────────────
const repostCache = new Map<string, { data: any; ts: number }>();
const REPOST_CACHE_TTL_MS = 2 * 60 * 1000;
const REPOST_CACHE_MAX = 400;

const cacheRepost = (id: string, data: any) => {
  repostCache.set(id, { data, ts: Date.now() });
  if (repostCache.size > REPOST_CACHE_MAX) {
    const oldest = [...repostCache.entries()]
      .sort((a, b) => a[1].ts - b[1].ts)
      .slice(0, repostCache.size - REPOST_CACHE_MAX)
      .map(([k]) => k);
    oldest.forEach((k) => repostCache.delete(k));
  }
};

const resolveRootPost = async (startId: string, wrapperId?: string): Promise<any | null> => {
  let current = startId;
  for (let hop = 0; hop < 5; hop++) {
    const cached = repostCache.get(current);
    if (cached && Date.now() - cached.ts < REPOST_CACHE_TTL_MS) {
      if (!cached.data) return null;
      if (!cached.data.repostOfId) return cached.data;
      current = cached.data.repostOfId;
      continue;
    }
    let data: any = null;
    try {
      const config = hop === 0 && wrapperId ? { viaRepostId: wrapperId } : undefined;
      const res = await postsService.getPost(current, config);
      data = res?.data || null;
    } catch {
      data = null;
    }
    cacheRepost(current, data);
    if (!data) return null;
    if (!data.repostOfId) return data;
    current = data.repostOfId;
  }
  const tail = repostCache.get(current);
  return tail?.data || null;
};

// ── RepostedPostCard (embedded preview of the original post) ────────────────
function RepostedPostCard({
  postId,
  wrapperId,
  isActive,
  onOpen,
  onTap,
}: {
  postId: string;
  wrapperId?: string;
  isActive?: boolean;
  onOpen?: (orig: any) => void;
  onTap?: (singleTap: () => void) => void;
}) {
  const colors = useThemeColors();
  const [orig, setOrig] = React.useState<any>(() => {
    const cached = repostCache.get(postId);
    return cached && cached.data && !cached.data.repostOfId ? cached.data : undefined;
  });
  const [loaded, setLoaded] = React.useState(!!orig);
  const [mediaPage, setMediaPage] = React.useState(0);
  const [isMuted, setIsMuted] = React.useState(true);

  const [pollData, setPollData] = React.useState<any>(null);
  const [myPollVote, setMyPollVote] = React.useState<number | null>(null);
  React.useEffect(() => {
    setPollData((orig as any)?.pollData || null);
    setMyPollVote((orig as any)?.myPollVote ?? null);
  }, [(orig as any)?.id]);

  React.useEffect(() => {
    let cancelled = false;
    resolveRootPost(postId, wrapperId)
      .then((root) => {
        if (cancelled) return;
        setOrig(root);
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setOrig(null);
        setLoaded(true);
      });
    return () => { cancelled = true; };
  }, [postId]);

  if (!loaded) return null;
  if (!orig) {
    return (
      <View
        style={{
          borderLeftWidth: 3,
          borderLeftColor: colors.border,
          backgroundColor: colors.bg.surface,
          borderRadius: radii.md,
          padding: 10,
          marginTop: 6,
          marginBottom: 6,
        }}
      >
        <Text style={{ fontSize: 12, color: colors.text.muted, fontStyle: "italic" }}>
          Original post is unavailable
        </Text>
      </View>
    );
  }

  const author = orig.author || {};
  const comm = (orig as any).community;
  const commName =
    typeof comm === "object" && comm
      ? comm.name || comm.slug
      : typeof comm === "string"
        ? comm
        : "";
  const media = (orig as any).media || [];
  const visual = media.filter((m: any) => m.media_type !== "audio" && m.type !== "audio");
  const origAudioMedia = media.filter((m: any) => m.media_type === "audio" || m.type === "audio");
  const origHasAudio = origAudioMedia.length > 0;
  const origLoc = (orig as any)?.location as { lat: number; lon: number; place?: string } | null | undefined;
  const origHasVideo = visual.some((m: any) => m.media_type === "video" || m.type === "video");
  const previewW = CARD_W - spacing.md * 2;
  let mediaH = 220;
  const first = visual[0];
  if (first?.width && first?.height) {
    const ratio = first.width / first.height;
    mediaH = Math.max(160, Math.min(previewW / ratio, 420));
  }

  const openOriginal = () => {
    if (orig?.id) onOpen?.(orig);
  };
  const handlePreviewPress = onTap ? () => onTap(openOriginal) : openOriginal;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={handlePreviewPress}
      style={{
        borderLeftWidth: 3,
        borderLeftColor: "rgba(124,58,237,0.45)",
        backgroundColor: colors.bg.surface,
        borderRadius: radii.md,
        padding: 10,
        marginTop: 6,
        marginBottom: 6,
        gap: 8,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View
          style={{
            width: 26,
            height: 26,
            borderRadius: 13,
            backgroundColor: colors.bg.elevated,
            overflow: "hidden",
          }}
        >
          {author.avatarUrl ? (
            <Image source={{ uri: author.avatarUrl }} style={{ width: 26, height: 26 }} />
          ) : (
            <Text style={{ fontSize: 13 }}>👾</Text>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={{ fontSize: 12, fontWeight: "700", color: colors.text.primary }}
            numberOfLines={1}
          >
            {author.name || author.username}
          </Text>
          <Text style={{ fontSize: 11, color: colors.text.secondary, fontWeight: "500" }}>
            @{author.username}
            {commName ? (
              <Text style={{ color: colors.primaryLight, fontWeight: "700" }}>
                {" "}• c/{commName}
              </Text>
            ) : null}
            {" · "}
            {formatInstagramTime((orig as any).createdAt || (orig as any).publishedAt)}
          </Text>
        </View>
      </View>

      {(orig as any).title ? (
        <Text style={{ fontSize: fontSizes.md, fontWeight: '700', color: colors.text.primary, lineHeight: 21 }} numberOfLines={2}>
          {(orig as any).title}
        </Text>
      ) : null}
      {(orig as any).content ? (
        <Text style={{ fontSize: fontSizes.sm, color: colors.text.secondary, lineHeight: 18, marginTop: (orig as any).title ? 4 : 0 }} numberOfLines={3}>
          {(orig as any).content}
        </Text>
      ) : null}

      {/* Invisible audio */}
      {origAudioMedia.length > 0 && (
        <View style={{ position: "absolute", opacity: 0, width: 0, height: 0 }}>
          {origAudioMedia.map((m: any, idx: number) => {
            const url = m.media_url || m.cloudfront_url || m.url || m.uri;
            return url ? (
              <FeedVideo
                key={`emb-audio-${idx}`}
                url={url}
                width={1}
                height={1}
                active={isActive ?? true}
                muted={isMuted}
                loop={false}
              />
            ) : null;
          })}
        </View>
      )}

      {/* Media carousel */}
      {visual.length > 0 && (
        <View style={{ position: "relative" }}>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            snapToInterval={previewW}
            decelerationRate="fast"
            onScroll={(e) => {
              const x = e.nativeEvent.contentOffset.x;
              const page = Math.max(0, Math.min(visual.length - 1, Math.round(x / previewW)));
              if (page !== mediaPage) setMediaPage(page);
            }}
            scrollEventThrottle={16}
          >
            {visual.map((m: any, idx: number) => {
              const url = m.media_url || m.cloudfront_url || m.url || m.uri;
              const isVid = m.media_type === "video" || m.type === "video";
              if (!url) return null;
              return (
                <View
                  key={idx}
                  style={{ width: previewW, height: mediaH, borderRadius: radii.sm, overflow: "hidden", backgroundColor: "#000" }}
                >
                  {isVid ? (
                    <FeedVideo
                      url={url}
                      width={previewW}
                      height={mediaH}
                      active={isActive ?? false}
                      loop
                      muted={isMuted || origHasAudio}
                    />
                  ) : (
                    <Image source={{ uri: url }} style={{ width: previewW, height: mediaH }} contentFit="cover" />
                  )}
                </View>
              );
            })}
          </ScrollView>

          {visual.length > 1 && (
            <View style={{ position: "absolute", bottom: 8, left: 0, right: 0, flexDirection: "row", justifyContent: "center", gap: 5 }}>
              {visual.map((_: any, i: number) => (
                <View
                  key={i}
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: i === mediaPage ? "#fff" : "rgba(255,255,255,0.5)",
                  }}
                />
              ))}
            </View>
          )}

          {/* Audio indicator — bottom-right inside media */}
          {origHasAudio && (
            <View style={{ position: "absolute", bottom: 8, right: 8, backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 12, width: 24, height: 24, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="musical-notes" size={12} color="#fff" />
            </View>
          )}
        </View>
      )}

      {pollData ? (
        <PollBlock poll={pollData} myVote={myPollVote} embedded />
      ) : null}

      {(((orig as any).likesCount ?? 0) + ((orig as any).commentsCount ?? 0) + ((orig as any).sharesCount ?? (orig as any).shares ?? 0) > 0 ||
        (isActive && (origHasAudio || origHasVideo))) && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
            <Ionicons name="heart-outline" size={13} color={colors.text.muted} />
            <Text style={{ fontSize: 11, color: colors.text.muted }}>{(orig as any).likesCount ?? 0}</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
            <Ionicons name="chatbubble-outline" size={12} color={colors.text.muted} />
            <Text style={{ fontSize: 11, color: colors.text.muted }}>{(orig as any).commentsCount ?? 0}</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
            <Ionicons name="repeat" size={12} color={colors.text.muted} />
            <Text style={{ fontSize: 11, color: colors.text.muted }}>{(orig as any).sharesCount ?? (orig as any).shares ?? 0}</Text>
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
}

// Re-export for backward compatibility
export type { PostCardProps };
