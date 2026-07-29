import React, { useMemo, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
  Animated,
  Image,
  Dimensions,
  ScrollView,
} from "react-native";
import { Video, ResizeMode } from "expo-av";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { radii, fontSizes, spacing, type ColorPalette } from "../../theme";
import { useThemeColors } from "../../context/ThemeContext";
import type { Post, HomeStackParamList } from "../../types";
import { xpService } from "../../services/xp.service";

const CARD_W = Dimensions.get("window").width - spacing.lg * 2;
const claimedPosts = new Set<string>();
let globalIsMuted = true;

interface PostCardProps {
  post: Post;
  onLike?: (id: string) => void;
  onSave?: (id: string) => void;
  onComment?: (post: Post) => void;
  onShare?: (post: Post) => void;
  onAuthorPress?: (post: Post) => void;
  isActive?: boolean;
  index?: number;
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    card: {
      marginHorizontal: spacing.lg,
      marginBottom: spacing.md,
      backgroundColor: c.bg.card,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: c.border,
      overflow: "hidden",
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      padding: spacing.md,
      gap: 10,
    },
    authorRow: {
      flexDirection: "row",
      alignItems: "center",
      flex: 1,
      gap: 10,
    },
    avatar: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: c.bg.elevated,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarEmoji: { fontSize: 18 },
    meta: { flex: 1 },
    author: {
      fontSize: fontSizes.sm,
      fontWeight: "700",
      color: c.text.primary,
    },
    sub: { fontSize: fontSizes.xs, color: c.text.muted, marginTop: 1 },
    community: { color: c.primaryLight },
    xpPill: {
      backgroundColor: "rgba(251,191,36,0.11)",
      borderWidth: 1,
      borderColor: "rgba(251,191,36,0.24)",
      paddingVertical: 3,
      paddingHorizontal: 8,
      borderRadius: radii.full,
    },
    xpText: { fontSize: fontSizes.xs, fontWeight: "800", color: c.xpGold },
    imageBanner: {
      height: 180,
      backgroundColor: c.bg.elevated,
      alignItems: "center",
      justifyContent: "center",
      position: "relative",
    },
    imageBannerEmoji: { fontSize: 52 },
    imageBannerLabel: {
      position: "absolute",
      bottom: 10,
      left: 10,
      backgroundColor: "rgba(0,0,0,0.55)",
      borderRadius: 6,
      paddingVertical: 2,
      paddingHorizontal: 8,
    },
    imageBannerLabelText: { fontSize: fontSizes.xs, color: c.text.secondary },
    body: {
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.md,
    },
    title: {
      fontSize: fontSizes.lg,
      fontWeight: "700",
      color: c.text.primary,
      marginBottom: 6,
    },
    content: {
      fontSize: fontSizes.md,
      color: c.text.primary,
      lineHeight: 21,
      marginBottom: 8,
    },
    tags: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
    tag: { fontSize: fontSizes.sm, color: c.cyanLight },
    actions: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: spacing.md,
      paddingVertical: 10,
      borderTopWidth: 1,
      borderTopColor: c.border,
      gap: 14,
    },
    action: { flexDirection: "row", alignItems: "center", gap: 5 },
    actionText: { fontSize: fontSizes.sm, color: c.text.muted },
    spacer: { flex: 1 },
  });
}

const formatInstagramTime = (dateString: string | undefined | null) => {
  if (!dateString) return "";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;

  const now = new Date();
  const diffInMs = now.getTime() - date.getTime();
  const diffInSecs = Math.floor(diffInMs / 1000);
  const diffInMins = Math.floor(diffInSecs / 60);
  const diffInHrs = Math.floor(diffInMins / 60);
  const diffInDays = Math.floor(diffInHrs / 24);

  if (diffInSecs < 60) {
    return "Just now";
  } else if (diffInMins < 60) {
    return `${diffInMins} minute${diffInMins > 1 ? "s" : ""} ago`;
  } else if (diffInHrs < 24) {
    return `${diffInHrs} hour${diffInHrs > 1 ? "s" : ""} ago`;
  } else if (diffInDays === 1) {
    return "Yesterday";
  } else if (diffInDays < 30) {
    return `${diffInDays} day${diffInDays > 1 ? "s" : ""} ago`;
  } else {
    const options: Intl.DateTimeFormatOptions = {
      day: "numeric",
      month: "short",
    };
    if (now.getFullYear() !== date.getFullYear()) {
      options.year = "numeric";
    }
    return date.toLocaleDateString("en-US", options);
  }
};

const RollingText = ({ items, isActive = true }: { items: React.ReactNode[]; isActive?: boolean }) => {
  const translateY = React.useRef(new Animated.Value(0)).current;
  const currentIndex = React.useRef(0);

  React.useEffect(() => {
    if (items.length <= 1 || !isActive) return;
    const interval = setInterval(() => {
      currentIndex.current += 1;

      Animated.timing(translateY, {
        toValue: -16 * currentIndex.current,
        duration: 500, // Smooth transition
        useNativeDriver: true,
      }).start(() => {
        // If we reached the duplicate of the first item, snap back to 0 seamlessly
        if (currentIndex.current === items.length) {
          currentIndex.current = 0;
          translateY.setValue(0);
        }
      });
    }, 3000);
    return () => clearInterval(interval);
  }, [items.length, isActive]);

  if (items.length === 0) return null;
  if (items.length === 1)
    return (
      <View style={{ height: 16, justifyContent: "center", marginTop: -2 }}>{items[0]}</View>
    );

  // Append a duplicate of the first item to enable seamless looping
  const displayItems = [...items, items[0]];

  return (
    <View style={{ height: 16, overflow: "hidden", marginTop: -2 }}>
      <Animated.View style={{ transform: [{ translateY }] }}>
        {displayItems.map((item, i) => (
          <View key={i} style={{ height: 16, justifyContent: "center" }}>
            {item}
          </View>
        ))}
      </Animated.View>
    </View>
  );
};

export default function PostCard({
  post,
  isActive,
  onLike,
  onSave,
  onComment,
  onShare,
  onAuthorPress,
  index,
}: PostCardProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const scale = useRef(new Animated.Value(1)).current;
  const navigation =
    useNavigation<NativeStackNavigationProp<HomeStackParamList>>();

  const [currentMediaPage, setCurrentMediaPage] = React.useState(0);
  const postId = String(post?.id || "");
  const author = useMemo(() => {
    const raw = (post as any)?.author || {};
    return {
      id: raw.id || (post as any)?.authorId || (post as any)?.author_id || "",
      name: raw.name || (post as any)?.authorName || (post as any)?.author_name || "Unknown User",
      username: raw.username || (post as any)?.authorUsername || (post as any)?.author_username || "unknown",
      avatarUrl: raw.avatarUrl || raw.avatar_url || (post as any)?.authorAvatar || (post as any)?.author_avatar,
      avatar: raw.avatar || "👾",
    };
  }, [post]);

  const [isClaimed, setIsClaimed] = React.useState(claimedPosts.has(postId));
  
  React.useEffect(() => {
    if (!isClaimed) {
      AsyncStorage.getItem(`claimed_post_${postId}`).then(val => {
        if (val === "true") {
          setIsClaimed(true);
          claimedPosts.add(postId);
        }
      }).catch(() => {});
    }
  }, [postId]);
  const [showPill, setShowPill] = React.useState(true);
  const [extraVideoTime, setExtraVideoTime] = React.useState(0);
  const [isMuted, setIsMuted] = React.useState(globalIsMuted);
  const [isExpanded, setIsExpanded] = React.useState(false);
  const progressAnim = useRef(new Animated.Value(claimedPosts.has(postId) ? 1 : 0)).current;
  const doubleTapAnim = useRef(new Animated.Value(0)).current;
  const pillOpacity = useRef(new Animated.Value(1)).current;
  const isPillVisible = useRef(true);
  const lastTapTime = useRef(0);

  const handleDoubleTap = () => {
    const now = Date.now();
    if (now - lastTapTime.current < 300) {
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
        })
      ]).start();
    }
    lastTapTime.current = now;
  };

  // Sync mute state when post becomes active
  React.useEffect(() => {
    if (isActive) {
      setIsMuted(globalIsMuted);
    }
  }, [isActive]);

  const toggleMute = () => {
    const newMuted = !isMuted;
    globalIsMuted = newMuted;
    setIsMuted(newMuted);
  };

  // Auto-hide pill if returning to a claimed post
  React.useEffect(() => {
    if (isClaimed) {
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
    }
  }, [isClaimed, isActive]);

  // Calculate View-to-Earn Time and XP
  const rewardXp = useMemo(() => {
    const hasText = !!post.content && post.content.trim().length > 0;
    const allMedia = (post as any).media || [];
    const visualMedia = allMedia.filter((m: any) => m.media_type !== "audio" && m.type !== "audio");
    const audioMedia = allMedia.filter((m: any) => m.media_type === "audio" || m.type === "audio");
    
    const typesCount = (hasText ? 1 : 0) + (visualMedia.length > 0 ? 1 : 0) + (audioMedia.length > 0 ? 1 : 0);
    if (typesCount >= 3) return 10;
    if (typesCount === 2) return 5;
    return 2;
  }, [post]);

  const requiredTimeMs = useMemo(() => {
    let time = 2000; // Base time
    
    if (post.content) {
      const wordCount = post.content.split(/\s+/).length;
      time += Math.floor(wordCount / 10) * 500;
    }
    
    const allMedia = (post as any).media || [];
    allMedia.forEach((m: any) => {
      const isVideo = m.media_type === "video" || m.type === "video";
      if (!isVideo) {
        time += 3000;
      }
    });
    
    time += extraVideoTime;
    
    return Math.min(15000, Math.max(3000, time));
  }, [post, extraVideoTime]);

  // Viewability Animation
  React.useEffect(() => {
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
          AsyncStorage.setItem(`claimed_post_${postId}`, "true").catch(() => {});
          xpService.creditXP(rewardXp, "earned", `view_post_${postId}`).catch(() => {});
        }
      });
    } else {
      progressAnim.stopAnimation();
      progressAnim.setValue(0);
    }
  }, [isActive, requiredTimeMs, isClaimed, rewardXp]);

  const previewH = useMemo(() => {
    const { width: SCREEN_W } = Dimensions.get("window");
    let h = CARD_W;
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
        h = CARD_W / minAspectRatio;
        if (h > SCREEN_W * 1.5) h = SCREEN_W * 1.5;
        if (h < SCREEN_W * 0.4) h = SCREEN_W * 0.4;
      }
    }
    return h;
  }, [post]);

  const handleLike = () => {
    Animated.sequence([
      Animated.spring(scale, {
        toValue: 1.3,
        useNativeDriver: true,
        speed: 50,
      }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 50 }),
    ]).start();
    onLike?.(postId);
  };

  const renderParsedText = (text: string, baseStyle: any, lines?: number) => {
    if (!text) return null;
    return (
      <Text style={baseStyle} numberOfLines={lines}>
        {text
          .split(
            /(\{@\}\[[^\]]+\]\([^)]+\)|\{#\}\[[^\]]+\]\([^)]+\)|@\w+|#\w+)/g,
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
                    navigation.navigate("UserProfile", {
                      user: {
                        id,
                        name,
                        handle: name,
                        avatar: "",
                        level: 1,
                        xp: 0,
                        xpToNext: 100,
                      },
                    } as any)
                  }
                >
                  @{name}
                </Text>
              );
            }

            const hashMatch = part.match(/^\{#\}\[([^\]]+)\]\(([^)]+)\)$/);
            if (hashMatch) {
              const tag = hashMatch[1];
              return (
                <Text
                  key={i}
                  style={{ color: colors.cyanLight }}
                  onPress={() => navigation.navigate("Search", { query: tag })}
                >
                  #{tag}
                </Text>
              );
            }

            if (part.startsWith("@")) {
              return (
                <Text
                  key={i}
                  style={{ color: colors.primaryLight, fontWeight: "700" }}
                  onPress={() =>
                    navigation.navigate("UserProfile", {
                      user: {
                        id: part.slice(1),
                        name: part.slice(1),
                        handle: part.slice(1),
                        avatar: "",
                        level: 1,
                        xp: 0,
                        xpToNext: 100,
                      },
                    } as any)
                  }
                >
                  {part}
                </Text>
              );
            }

            if (part.startsWith("#")) {
              return (
                <Text
                  key={i}
                  style={{ color: colors.cyanLight }}
                  onPress={() =>
                    navigation.navigate("Search", {
                      query: part.replace("#", ""),
                    })
                  }
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

  const allMedia = (post as any).media || [];
  const hasMedia = allMedia.length > 0 || !!post.mediaUri || (post.type === "image" && !!post.image);
  const contentLimitLines = hasMedia ? 2 : 10;
  const contentCharLimit = hasMedia ? 80 : 350;

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.authorRow}
          onPress={() => onAuthorPress?.(post)}
          activeOpacity={0.7}
        >
          <View style={styles.avatar}>
            {author.avatarUrl ? (
              <Image
                source={{ uri: author.avatarUrl }}
                style={{ width: 44, height: 44, borderRadius: 22 }}
              />
            ) : (
              <Text style={styles.avatarEmoji}>
                {author.avatar}
              </Text>
            )}
          </View>
          <View style={styles.meta}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "flex-start",
                paddingRight: 90, // Leave room for the absolute pill
              }}
            >
              <Text style={styles.author} numberOfLines={1}>{author.name}</Text>
              {showPill && (
                <Animated.View style={[
                  styles.xpPill, 
                  { 
                    paddingHorizontal: 0, paddingVertical: 0, overflow: 'hidden', 
                    position: 'absolute', right: 0, top: -2, opacity: pillOpacity 
                  },
                  isClaimed && { borderColor: 'rgba(34,197,94,0.35)', backgroundColor: 'rgba(34,197,94,0.1)' }
                ]}>
                  {!isClaimed && (
                    <Animated.View 
                      style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        bottom: 0,
                        backgroundColor: 'rgba(251,191,36,0.3)',
                        width: progressAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: ['0%', '100%']
                        })
                      }}
                    />
                  )}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 3, paddingHorizontal: 8 }}>
                    {isClaimed ? (
                      <Ionicons name="checkmark-circle" size={14} color="#22c55e" />
                    ) : (
                      <Text style={{ fontSize: 12 }}>⚡</Text>
                    )}
                    <Text style={[styles.xpText, isClaimed && { color: '#22c55e' }]}>
                      {index === 0 && !isActive 
                        ? (isClaimed ? `Earned ${rewardXp} XP` : `View to Earn`) 
                        : `${rewardXp} XP`}
                    </Text>
                  </View>
                </Animated.View>
              )}
            </View>
            {(() => {
              const hasAudio = ((post as any).media || []).some(
                (m: any) => m.media_type === "audio" || m.type === "audio",
              );
              const rollItems = [
                <Text
                  key="username"
                  style={[
                    styles.sub,
                    {
                      color: colors.text.secondary,
                      fontWeight: "500",
                      marginTop: 0,
                    },
                  ]}
                >
                  @{author.username}
                  {post.community ? (
                    <Text
                      style={{ color: colors.primaryLight, fontWeight: "700" }}
                      onPress={(e) => {
                        e.stopPropagation();
                        if (typeof post.community === 'object' && (post.community as any).slug) {
                          navigation.navigate('CommunityStack' as any, {
                            screen: 'CommunityDetail',
                            params: { communitySlug: (post.community as any).slug }
                          } as any);
                        }
                      }}
                    >
                      {" "}• c/{typeof post.community === 'object' ? ((post.community as any).name || (post.community as any).slug) : post.community}
                    </Text>
                  ) : null}
                </Text>,
                <Text
                  key="time"
                  style={[
                    styles.sub,
                    {
                      color: colors.text.secondary,
                      fontWeight: "500",
                      marginTop: 0,
                    },
                  ]}
                >
                  {formatInstagramTime(
                    post.createdAt || (post as any).publishedAt,
                  )}
                </Text>,
              ];
              if (hasAudio) {
                rollItems.push(
                  <View
                    key="audio"
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <Ionicons
                      name="musical-notes"
                      size={12}
                      color={colors.text.muted}
                    />
                    <Text
                      style={{
                        color: colors.text.muted,
                        fontSize: fontSizes.xs,
                        fontWeight: "500",
                      }}
                    >
                      Original Audio
                    </Text>
                  </View>,
                );
              }
              return <RollingText items={rollItems} isActive={isActive ?? true} />;
            })()}
          </View>
        </TouchableOpacity>
      </View>

      {/* Body Text Before Media */}
      <TouchableWithoutFeedback onPress={handleDoubleTap}>
        <View style={[styles.body, { paddingTop: 0 }]}>
          {!!(post as any).title &&
            renderParsedText((post as any).title, styles.title, isExpanded ? undefined : 2)}
          {!!post.content && renderParsedText(post.content, styles.content, isExpanded ? undefined : contentLimitLines)}

          {!isExpanded && (((post as any).title && (post as any).title.length > 80) || (post.content && post.content.length > contentCharLimit)) && (
            <TouchableOpacity onPress={() => setIsExpanded(true)} style={{ marginTop: -4, marginBottom: 8 }} activeOpacity={0.7}>
              <Text style={{ color: colors.text.muted, fontSize: fontSizes.sm, fontWeight: '600' }}>Read more...</Text>
            </TouchableOpacity>
          )}

        </View>
      </TouchableWithoutFeedback>

      {/* Multi-Media Banner */}
      {(() => {
        const allMedia = (post as any).media || [];
        if (allMedia.length === 0) {
          return post.mediaUri ? (
            <Image
              source={{ uri: post.mediaUri }}
              style={{ width: CARD_W, height: previewH, backgroundColor: "#000" }}
              resizeMode="contain"
            />
          ) : post.type === "image" && post.image ? (
            <View style={styles.imageBanner}>
              <Text style={styles.imageBannerEmoji}>{post.image}</Text>
              <View style={styles.imageBannerLabel}>
                <Text style={styles.imageBannerLabelText}>Media Post</Text>
              </View>
            </View>
          ) : null;
        }

        const visualMedia = allMedia.filter(
          (m: any) => m.media_type !== "audio" && m.type !== "audio"
        );
        const audioMedia = allMedia.filter(
          (m: any) => m.media_type === "audio" || m.type === "audio"
        );
        const renderMedia = visualMedia;
        const hasAudioTrack = audioMedia.length > 0;

        return (
          <View style={{ position: "relative" }}>
            {renderMedia.length > 0 && (
              <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                snapToInterval={CARD_W}
                decelerationRate="fast"
                onScroll={(e) => {
                  const x = e.nativeEvent.contentOffset.x;
                  const page = Math.max(
                    0,
                    Math.min(renderMedia.length - 1, Math.round(x / CARD_W))
                  );
                  if (page !== currentMediaPage) setCurrentMediaPage(page);
                }}
                scrollEventThrottle={16}
              >
                {renderMedia.map((m: any, idx: number) => {
                  const url = m.cloudfront_url || m.url || m.uri;
                  const isVideo = m.media_type === "video" || m.type === "video";

                  if (isVideo) {
                    return (
                      <TouchableWithoutFeedback key={idx} onPress={handleDoubleTap}>
                        <View
                          style={{
                            width: CARD_W,
                            height: previewH,
                            backgroundColor: "#000",
                          }}
                        >
                          <Video
                            source={{ uri: url }}
                            style={{ width: CARD_W, height: previewH }}
                            resizeMode={ResizeMode.CONTAIN}
                            shouldPlay={isActive ?? true}
                            isLooping
                            isMuted={isMuted || hasAudioTrack}
                            onLoad={(meta: any) => {
                              if (meta.durationMillis) {
                                setExtraVideoTime(prev => prev + meta.durationMillis);
                              }
                            }}
                          />
                        </View>
                      </TouchableWithoutFeedback>
                    );
                  }
                  return url ? (
                    <TouchableWithoutFeedback key={idx} onPress={handleDoubleTap}>
                      <Image
                        source={{ uri: url }}
                        style={{
                          width: CARD_W,
                          height: previewH,
                          backgroundColor: "#000",
                        }}
                        resizeMode="contain"
                      />
                    </TouchableWithoutFeedback>
                  ) : null;
                })}
              </ScrollView>
            )}


            {/* Pagination Dots */}
            {renderMedia.length > 1 && (
              <View
                style={{
                  position: "absolute",
                  bottom: 12,
                  left: 0,
                  right: 0,
                  flexDirection: "row",
                  justifyContent: "center",
                  gap: 6,
                }}
              >
                {renderMedia.map((_: any, i: number) => (
                  <View
                    key={i}
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 3,
                      backgroundColor:
                        i === currentMediaPage
                          ? "#fff"
                          : "rgba(255,255,255,0.5)",
                      shadowColor: "#000",
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: 0.3,
                      shadowRadius: 2,
                      elevation: 2,
                    }}
                  />
                ))}
              </View>
            )}

            {/* Invisible audio playback */}
            {audioMedia.length > 0 && (
              <View style={{ position: "absolute", opacity: 0, width: 0, height: 0 }}>
                {audioMedia.map((m: any, idx: number) => {
                  const url = m.cloudfront_url || m.url || m.uri;
                  return url ? (
                    <Video
                      key={`bg-audio-${idx}`}
                      source={{ uri: url }}
                      shouldPlay={isActive ?? true}
                      isLooping={false}
                      isMuted={isMuted}
                      style={{ width: 0, height: 0 }}
                    />
                  ) : null;
                })}
              </View>
            )}

            {/* Mute Toggle Overlay */}
            {isActive && (hasAudioTrack || visualMedia.some((m: any) => m.media_type === "video" || m.type === "video")) && (
              <TouchableOpacity
                style={{
                  position: "absolute",
                  bottom: 3,
                  right: 12,
                  backgroundColor: "rgba(0,0,0,0.4)",
                  borderRadius: 12,
                  width: 24,
                  height: 24,
                  alignItems: "center",
                  justifyContent: "center",
                }}
                onPress={toggleMute}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={isMuted ? "volume-mute" : "volume-high"}
                  size={12}
                  color="#fff"
                />
              </TouchableOpacity>
            )}
          </View>
        );
      })()}

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.action} onPress={handleLike}>
          <Animated.View style={{ transform: [{ scale }] }}>
            <Ionicons
              name={post.isLiked ? "heart" : "heart-outline"}
              size={20}
              color={post.isLiked ? colors.primaryLight : colors.text.muted}
            />
          </Animated.View>
          <Text
            style={[styles.actionText, post.isLiked && { color: colors.primaryLight }]}
          >
            {(post.likes ?? (post as any).likesCount ?? 0).toLocaleString()}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.action}
          onPress={() => onComment?.(post)}
        >
          <Ionicons
            name="chatbubble-outline"
            size={18}
            color={colors.text.muted}
          />
          <Text style={styles.actionText}>
            {(
              post.comments ??
              (post as any).commentsCount ??
              0
            ).toLocaleString()}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.action} onPress={() => onShare?.(post)}>
          <Ionicons
            name="arrow-redo-outline"
            size={18}
            color={colors.text.muted}
          />
          <Text style={styles.actionText}>Share</Text>
        </TouchableOpacity>

        <View style={styles.spacer} />

        <TouchableOpacity onPress={() => onSave?.(postId)}>
          <Ionicons
            name={post.isSaved ? "bookmark" : "bookmark-outline"}
            size={20}
            color={post.isSaved ? colors.primary : colors.text.muted}
          />
        </TouchableOpacity>
      </View>

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
        <Ionicons name="heart" size={100} color={colors.primaryLight} style={{
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 5,
        }} />
      </Animated.View>
    </View>
  );
}
