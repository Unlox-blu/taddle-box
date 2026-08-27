import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TouchableOpacity, TouchableWithoutFeedback, Animated } from "react-native";
import { xpService } from "../../../../../../services/xp.service";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { fontSizes, type ColorPalette } from "../../../../../../theme";
import type { Post, HomeStackParamList } from "../../../../../../types";
import ActiveStatusDot from "../../../../ActiveStatusDot";
import { RollingText, formatInstagramTime } from "./shared";
import type { PostCardStyles } from "./shared";


export interface PostHeaderAuthor {
  id: string;
  name: string;
  username: string;
  avatarUrl?: string;
  avatar: string;
  repostsEnabled?: boolean;
}

interface PostHeaderProps {
  post: Post;
  author: PostHeaderAuthor;
  colors: ColorPalette;
  styles: PostCardStyles;
  onAuthorPress?: (post: Post) => void;
  onMenuToggle: () => void;
  index?: number;
  isActive?: boolean;
  onBodyTap?: () => void;
}

// ── Module-level XP claim tracker ───────────────────────────────────────────
const claimedPosts = new Set<string>();

function PostHeaderInner({
  post,
  author,
  colors,
  styles: s,
  onAuthorPress,
  onMenuToggle,
  index,
  isActive,
  onBodyTap,
}: PostHeaderProps) {
  const navigation =
    useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const postId = String(post?.id || "");

  // ── XP pill state (owned by header — no other section needs these) ─────
  const [isClaimed, setIsClaimed] = useState(
    (post as any).isXpClaimed || claimedPosts.has(postId),
  );
  const [showPill, setShowPill] = useState(true);
  const pillOpacity = useRef(new Animated.Value(1)).current;
  const progressAnim = useRef(
    new Animated.Value(claimedPosts.has(postId) ? 1 : 0),
  ).current;
  const isPillVisible = useRef(true);
  const rewardXp = useMemo(() => {
    const hasText = !!post.content && post.content.trim().length > 0;
    const allMedia = (post as any).media || [];
    const visualMedia = allMedia.filter(
      (m: any) => m.media_type !== "audio" && m.type !== "audio",
    );
    const audioMedia = allMedia.filter(
      (m: any) => m.media_type === "audio" || m.type === "audio",
    );
    const typesCount =
      (hasText ? 1 : 0) +
      (visualMedia.length > 0 ? 1 : 0) +
      (audioMedia.length > 0 ? 1 : 0);
    if (typesCount >= 3) return 10;
    if (typesCount === 2) return 5;
    return 2;
  }, [post]);

  // Reset on card recycle
  useEffect(() => {
    setIsClaimed((post as any).isXpClaimed || claimedPosts.has(postId));
  }, [postId]);

  // View time tracking — requiredTimeMs grows with media count + video duration
  const requiredTimeMs = useMemo(() => {
    let time = 3000; // base for text
    const allMedia = (post as any).media || [];
    allMedia.forEach((m: any) => {
      const isVideo = m.media_type === "video" || m.type === "video";
      if (isVideo) {
        // Use the backend-reported duration (ms) if available, else default 5s
        const dur = (m.duration || m.videoDuration || 5000) as number;
        time += Math.min(dur, 10000); // cap per-video at 10s
      } else {
        time += 3000; // 3s per image
      }
    });
    return Math.min(15000, Math.max(3000, time));
  }, [post]);

  // XP progress animation — fills the bar when the post is active.
  // On completion, credits XP and marks the post as claimed.
  useEffect(() => {
    if (isClaimed) {
      progressAnim.setValue(1);
      return;
    }
    if (isActive) {
      Animated.timing(progressAnim, {
        toValue: 1,
        duration: requiredTimeMs,
        useNativeDriver: false,
      }).start(({ finished }) => {
        if (finished) {
          setIsClaimed(true);
          claimedPosts.add(postId);
          xpService
            .creditXP(rewardXp, "earned", `view_post_${postId}`)
            .catch(() => {});
        }
      });
    } else {
      progressAnim.stopAnimation();
      progressAnim.setValue(0);
    }
    return () => {
      progressAnim.stopAnimation();
    };
  }, [isActive, requiredTimeMs, isClaimed, rewardXp, postId, progressAnim]);

  // Auto-hide pill when claimed + visible
  useEffect(() => {
    if (!isClaimed) return;
    if (isActive) {
      if (!isPillVisible.current) {
        pillOpacity.setValue(0);
        setShowPill(true);
        isPillVisible.current = true;
        Animated.timing(pillOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }).start();
      }
      const timer = setTimeout(() => {
        Animated.timing(pillOpacity, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (finished) {
            setShowPill(false);
            isPillVisible.current = false;
          }
        });
      }, 3000);
      return () => {
        clearTimeout(timer);
        pillOpacity.stopAnimation();
      };
    } else {
      pillOpacity.setValue(0);
      setShowPill(false);
      isPillVisible.current = false;
    }
  }, [isClaimed, isActive]);

  // ── Rolling-text items ────────────────────────────────────────────────────
  const rollItems = useMemo(() => {
    const items: React.ReactNode[] = [
      <Text
        key="username"
        style={[s.sub, { color: colors.text.secondary, fontWeight: "500", marginTop: 0 }]}
      >
        @{author.username}
        {post.community ? (
          <Text
            style={{ color: colors.primaryLight, fontWeight: "700" }}
            onPress={(e: any) => {
              e.stopPropagation();
              if (typeof post.community === "object" && (post.community as any).slug) {
                navigation.navigate("Community" as any, {
                  screen: "CommunityDetail",
                  params: { communitySlug: (post.community as any).slug },
                } as any);
              }
            }}
          >
            {" "}• c/
            {typeof post.community === "object"
              ? (post.community as any).name || (post.community as any).slug
              : post.community}
          </Text>
        ) : null}
      </Text>,
      <Text
        key="time"
        style={[s.sub, { color: colors.text.secondary, fontWeight: "500", marginTop: 0 }]}
      >
        {formatInstagramTime(post.createdAt || (post as any).publishedAt)}
      </Text>,
    ];

    if ((post as any).location && !(post as any).repostOfId) {
      items.push(
        <View key="location" style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Ionicons name="location" size={12} color={colors.text.muted} />
          <Text style={{ color: colors.text.muted, fontSize: fontSizes.xs, fontWeight: "500" }} numberOfLines={1}>
            {(post as any).location?.place ||
              `${((post as any).location?.lat ?? 0).toFixed(4)}, ${((post as any).location?.lon ?? 0).toFixed(4)}`}
          </Text>
        </View>,
      );
    }

    const hasAudio = ((post as any).media || []).some(
      (m: any) => m.media_type === "audio" || m.type === "audio",
    );
    if (hasAudio && !(post as any).repostOfId) {
      items.push(
        <View key="audio" style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Ionicons name="musical-notes" size={12} color={colors.text.muted} />
          <Text style={{ color: colors.text.muted, fontSize: fontSizes.xs, fontWeight: "500" }}>
            Original Audio
          </Text>
        </View>,
      );
    }

    return items;
  }, [post, author, colors, navigation]);

  return (
    <View style={s.header}>
      <TouchableWithoutFeedback onPress={() => onBodyTap?.()}>
        <View style={s.authorRow}>
          <View style={{ position: "relative" }}>
            <TouchableOpacity onPress={() => onAuthorPress?.(post)} activeOpacity={0.7}>
              <View style={s.avatar}>
                {author.avatarUrl ? (
                  <Image source={{ uri: author.avatarUrl }} style={{ width: 44, height: 44, borderRadius: 22 }} />
                ) : (
                  <Text style={s.avatarEmoji}>{author.avatar}</Text>
                )}
              </View>
            </TouchableOpacity>
            <ActiveStatusDot userId={author.id || undefined} size={12} style={{ bottom: -2, right: -2 }} />
          </View>
          <View style={s.meta}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <TouchableOpacity onPress={() => onAuthorPress?.(post)} activeOpacity={0.7} style={{ flexShrink: 1 }}>
                <Text style={[s.author]} numberOfLines={1}>
                  {author.name}
                </Text>
              </TouchableOpacity>

              <View style={{ flex: 1 }} />

              {/* XP Pill */}
            {showPill && (
              <Animated.View
                style={[
                  s.xpPill,
                  { paddingHorizontal: 0, paddingVertical: 0, overflow: "hidden", opacity: pillOpacity },
                  isClaimed && { borderColor: "rgba(34,197,94,0.35)", backgroundColor: "rgba(34,197,94,0.1)" },
                ]}
              >
                {!isClaimed && (
                  <Animated.View
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      bottom: 0,
                      backgroundColor: "rgba(251,191,36,0.3)",
                      width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }),
                    }}
                  />
                )}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 3, paddingVertical: 2, paddingHorizontal: 6 }}>
                  {isClaimed ? (
                    <Ionicons name="checkmark-circle" size={12} color="#22c55e" />
                  ) : (
                    <Text style={{ fontSize: 10 }}>⚡</Text>
                  )}
                  <Text style={[s.xpText, isClaimed && { color: "#22c55e" }]}>
                    {index === 0 && !isActive
                      ? isClaimed ? `Earned ${rewardXp} XP` : "View to Earn"
                      : `${rewardXp} XP`}</Text>
                </View>
              </Animated.View>
            )}

            {/* Three Dots */}
            <View style={{ position: "relative" }}>
              <TouchableOpacity
                onPress={onMenuToggle}
                style={{ padding: 2 }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="ellipsis-vertical" size={15} color={colors.text.muted} />
              </TouchableOpacity>
            </View>
          </View>
          <RollingText items={rollItems} isActive={isActive ?? true} />
        </View>
        </View>
      </TouchableWithoutFeedback>
    </View>
  );
}

export default React.memo(PostHeaderInner);
