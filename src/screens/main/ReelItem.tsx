/**
 * ReelItem — Single full-screen reel cell matching PostCard UX exactly.
 *
 * Layout (top → bottom):
 *   1. Top overlay — author row matches PostHeader:
 *      Left: avatar + name + community badge | Right: XP pill + ⋯ menu
 *      Below: RollingText (username•community, time, location, audio)
 *   2. Text content area — title + parsed body below author
 *   3. Center — full-screen media (video/image/audio/text/poll)
 *      with tiny centered mute toggle (Instagram-style)
 *   4. Bottom overlay — gradient scrim + horizontal action bar
 *      (like · comment · poll(icon) · repost · save · share · mute)
 *   5. Single-tap toggles overlays, double-tap likes (purple heart burst),
 *      long-press pauses video. Pinch-to-zoom handled by ZoomableMedia.
 */
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Animated,
  Dimensions,
  Modal,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
  Keyboard,
  Platform,
  FlatList,
  KeyboardAvoidingView,
  Pressable,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useTheme } from "@react-navigation/native";
import { useQueryClient } from "@tanstack/react-query";
import { fontSizes, spacing, radii } from "../../theme";
import { BlurView } from "expo-blur";
import MaskedView from "@react-native-masked-view/masked-view";
import { useAuth } from "../../context/AuthContext";
import type { Post } from "../../types";
import { postsService } from "../../services/posts.service";
import { userService } from "../../services/user.service";
import { queryKeys } from "../../lib/queryKeys";
import {
  ActiveVideo,
  RollingText,
  formatInstagramTime,
  ZoomableMedia,
} from "../../components/common/contentCards/types/postCard/components/shared";
import ActiveStatusDot from "../../components/common/ActiveStatusDot";
import PollBlock from "../../components/common/PollBlock";
import PostMenuSheet from "../../components/home/PostMenuSheet";
import { themedAlert } from "../../components/common/ThemedAlert";
import { xpService } from "../../services/xp.service";
import { warn } from "../../utils/logger";
import StateBlock from "../../components/common/StateBlock";

// Module-level cache of already-claimed XP posts (same as PostHeader)
const claimedPosts = new Set<string>();

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

// ─── formatCount ──────────────────────────────────────────────────────────────
function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ─── UsersModal (likers / reposters) ─────────────────────────────────────────
function UsersModal({
  visible,
  postId: pid,
  title,
  emptyText,
  fetchPage,
  onClose,
}: {
  visible: boolean;
  postId: string;
  title: string;
  emptyText: string;
  fetchPage: (
    id: string,
    page: number,
    limit: number,
  ) => Promise<{ data: any[] }>;
  onClose: () => void;
}) {
  const navigation = useNavigation<any>();
  const [users, setUsers] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = async (nextPage: number, refresh = false) => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetchPage(pid, nextPage, 20);
      const rows = res?.data || [];
      setHasMore(rows.length === 20);
      setUsers((prev) => (refresh ? rows : [...prev, ...rows]));
      setPage(nextPage);
    } catch (e) {
      warn("Failed to load users", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible) {
      setUsers([]);
      setPage(1);
      load(1, true);
    }
  }, [visible]);

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        activeOpacity={1}
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.55)",
          justifyContent: "flex-end",
        }}
      >
        <View
          onStartShouldSetResponder={() => true}
          style={{
            maxHeight: "60%",
            borderTopLeftRadius: radii.xl,
            borderTopRightRadius: radii.xl,
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.md,
            paddingBottom: 24,
            backgroundColor: "#1a1a2e",
            borderTopWidth: 1,
            borderTopColor: "rgba(255,255,255,0.08)",
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: spacing.sm,
            }}
          >
            <Text
              style={{
                fontSize: fontSizes.lg,
                fontWeight: "800",
                color: "#F1F5F9",
              }}
            >
              {title}
            </Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color="rgba(255,255,255,0.5)" />
            </TouchableOpacity>
          </View>
          <FlatList
            data={users}
            keyExtractor={(item: any) =>
              String(item.id || item.userId || Math.random())
            }
            renderItem={({ item: u }: any) => (
              <TouchableOpacity
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  paddingVertical: 8,
                }}
                onPress={() => {
                  onClose();
                  navigation.push("UserProfile", { user: u });
                }}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: "rgba(124,58,237,0.3)",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                  }}
                >
                  {u.avatarUrl || u.avatar_url ? (
                    <Image
                      source={{ uri: u.avatarUrl || u.avatar_url }}
                      style={{ width: 36, height: 36 }}
                      contentFit="cover"
                    />
                  ) : (
                    <Text style={{ fontSize: 16 }}>{u.avatar || "👾"}</Text>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: fontSizes.sm,
                      fontWeight: "700",
                      color: "#F1F5F9",
                    }}
                    numberOfLines={1}
                  >
                    {u.name || u.username}
                  </Text>
                  <Text
                    style={{
                      fontSize: fontSizes.xs,
                      color: "rgba(255,255,255,0.5)",
                    }}
                  >
                    @{u.username}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
            onEndReached={() => {
              if (hasMore && !loading) load(page + 1);
            }}
            onEndReachedThreshold={0.3}
            ListFooterComponent={
              loading ? (
                <StateBlock
                  inline
                  loading
                  loaderSize={18}
                  style={{ marginVertical: 12 }}
                />
              ) : null
            }
            ListEmptyComponent={
              !loading ? (
                <Text
                  style={{
                    textAlign: "center",
                    paddingVertical: 28,
                    fontSize: fontSizes.sm,
                    color: "rgba(255,255,255,0.5)",
                  }}
                >
                  {emptyText}
                </Text>
              ) : null
            }
          />
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── ParsedText ───────────────────────────────────────────────────────────────
function ParsedReelText({
  text,
  onMentionPress,
  onHashtagPress,
  onCommunityPress,
  numberOfLines = 4,
}: {
  text: string;
  onMentionPress: (name: string) => void;
  onHashtagPress: (tag: string) => void;
  onCommunityPress: (slug: string) => void;
  numberOfLines?: number;
}) {
  if (!text) return null;
  const parts = text.split(
    /(\{@\}\[[^\]]+\]\([^)]+\)|\{#\}\[[^\]]+\]\([^)]+\)|\{c\/\}\[[^\]]+\]\([^)]+\)|@\w+|#\w+|c\/\w+)/g,
  );
  return (
    <Text style={styles.parsedText} numberOfLines={numberOfLines}>
      {parts.map((part: string, i: number) => {
        const mentionMatch = part.match(/^\{@\}\[([^\]]+)\]\(([^)]+)\)$/);
        if (mentionMatch)
          return (
            <Text
              key={i}
              style={styles.linkText}
              onPress={() => onMentionPress(mentionMatch[1])}
            >
              @{mentionMatch[1]}
            </Text>
          );
        const hashMatch = part.match(/^\{#\}\[([^\]]+)\]\(([^)]+)\)$/);
        if (hashMatch)
          return (
            <Text
              key={i}
              style={styles.linkText}
              onPress={() => onHashtagPress(hashMatch[1])}
            >
              #{hashMatch[1]}
            </Text>
          );
        const communityMatch = part.match(/^\{c\/\}\[([^\]]+)\]\(([^)]+)\)$/);
        if (communityMatch)
          return (
            <Text
              key={i}
              style={styles.communityLinkText}
              onPress={() => onCommunityPress(communityMatch[1])}
            >
              c/{communityMatch[1]}
            </Text>
          );
        if (part.startsWith("@"))
          return (
            <Text
              key={i}
              style={styles.linkText}
              onPress={() => onMentionPress(part.slice(1))}
            >
              {part}
            </Text>
          );
        if (part.startsWith("#"))
          return (
            <Text
              key={i}
              style={styles.linkText}
              onPress={() => onHashtagPress(part.slice(1))}
            >
              {part}
            </Text>
          );
        const plainCommunity = part.match(/^c\/([a-z0-9_]+)$/i);
        if (plainCommunity)
          return (
            <Text
              key={i}
              style={styles.communityLinkText}
              onPress={() => onCommunityPress(plainCommunity[1])}
            >
              {part}
            </Text>
          );
        return <Text key={i}>{part}</Text>;
      })}
    </Text>
  );
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
  onReposted?: () => void;
  showDelete: boolean;
  isProfileReel?: boolean;
}

// ─── RepostedReelPreview (embedded preview — matches PostCard RepostedPostCard exactly) ──
function RepostedReelPreview({
  post,
  isActive,
  onPress,
}: {
  post: Post;
  isActive?: boolean;
  onPress: (orig: Post) => void;
}) {
  const [orig, setOrig] = useState<any>(null);
  const [privateAuthor, setPrivateAuthor] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const navigation = useNavigation<any>();
  const [mediaPage, setMediaPage] = useState(0);
  const [pollData, setPollData] = useState<any>(null);
  const [myPollVote, setMyPollVote] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const repostId = (post as any).repostOfId;
    if (!repostId) {
      setLoading(false);
      return;
    }
    postsService.getFeed(1, 1).catch(() => {});
    postsService
      .getPost(repostId)
      .then((res) => {
        if (!cancelled) {
          setOrig(res?.data || null);
          setLoading(false);
        }
      })
      .catch((e: any) => {
        if (!cancelled) {
          if (e.response?.status === 403 && e.response?.data?.errors?.isPrivate) {
            setPrivateAuthor(e.response.data.errors.author);
          }
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [(post as any).repostOfId]);

  useEffect(() => {
    setPollData((orig as any)?.pollData || null);
    setMyPollVote((orig as any)?.myPollVote ?? null);
  }, [(orig as any)?.id]);

  const handlePollVote = useCallback(
    async (optionIndex: number) => {
      try {
        const res = await postsService.castPollVote((orig as any)?.id, optionIndex);
        const data = res?.data || res;
        setMyPollVote(data?.myVote ?? null);
        if (data?.pollData) setPollData(data.pollData);
      } catch (e: any) {
        themedAlert(
          "Vote Error",
          e?.response?.data?.message || "Could not record your vote."
        );
      }
    },
    [(orig as any)?.id]
  );

  if (loading) {
    return (
      <View style={styles.repostPreview}>
        <StateBlock
          inline
          loading
          loaderSize={16}
          style={{ marginVertical: 8 }}
        />
      </View>
    );
  }

  if (!orig) {
    if (privateAuthor) {
      const author = {
        id: privateAuthor.id || "",
        name: privateAuthor.name || "Private User",
        username: privateAuthor.username || "unknown",
        avatarUrl: privateAuthor.avatar_url?.cloudfront_url || privateAuthor.avatar_url,
        avatar: privateAuthor.avatar || "👾",
      };
      return (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => navigation.push("Profile", { userId: author.id })}
          style={styles.repostPreview}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(124,58,237,0.3)", overflow: "hidden", alignItems: "center", justifyContent: "center" }}>
              {author.avatarUrl ? (
                <Image source={{ uri: author.avatarUrl }} style={{ width: 44, height: 44 }} contentFit="cover" />
              ) : (
                <Text style={{ fontSize: 18 }}>{author.avatar}</Text>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: "#F1F5F9" }}>{author.name}</Text>
              <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>@{author.username}</Text>
            </View>
          </View>
          <View style={{ marginTop: 12, backgroundColor: "rgba(255,255,255,0.05)", padding: 12, borderRadius: 8, flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Ionicons name="lock-closed" size={16} color="rgba(255,255,255,0.6)" />
            <Text style={{ flex: 1, fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
              This account is private. Tap to view profile and request to follow.
            </Text>
          </View>
        </TouchableOpacity>
      );
    }
    return (
      <View style={styles.repostPreview}>
        <Text
          style={{
            fontSize: 12,
            color: "rgba(255,255,255,0.4)",
            fontStyle: "italic",
          }}
        >
          Original post is unavailable
        </Text>
      </View>
    );
  }

  const rawAuthor = (orig as any).author || {};
  const author = {
    id: rawAuthor.id || "",
    name: rawAuthor.name || "Unknown User",
    username: rawAuthor.username || "unknown",
    avatarUrl: rawAuthor.avatar_url?.cloudfront_url || rawAuthor.avatar_url,
    avatar: rawAuthor.avatar || "👾",
  };
  const comm = (orig as any).community;
  const commName =
    typeof comm === "object" && comm
      ? comm.name || comm.slug
      : typeof comm === "string"
        ? comm
        : "";
  const media = (orig as any).media || [];
  const visual = media.filter(
    (m: any) => m.media_type !== "audio" && m.type !== "audio",
  );
  const audioMedia = media.filter(
    (m: any) => m.media_type === "audio" || m.type === "audio",
  );
  const hasAudio = audioMedia.length > 0;
  const hasVideo = visual.some(
    (m: any) => m.media_type === "video" || m.type === "video",
  );
  const origLoc = (orig as any)?.location;
  const timeAgo = formatInstagramTime(
    (orig as any).createdAt || (orig as any).publishedAt,
  );

  const previewW = SCREEN_W - 48;
  let mediaH = 220;
  const first = visual[0];
  if (first?.width && first?.height) {
    const ratio = first.width / first.height;
    mediaH = Math.max(160, Math.min(previewW / ratio, 420));
  }


  // RollingText items matching PostCard exactly — all items must be <Text>
  const rollItems: React.ReactNode[] = [
    <Text
      key="username"
      style={{
        fontSize: 10,
        color: "rgba(255,255,255,0.55)",
        fontWeight: "500",
      }}
    >
      @{author.username}
      {commName ? (
        <Text style={{ color: "#93C5FD", fontWeight: "700" }}>
          {" "}
          • c/{commName}
        </Text>
      ) : null}
    </Text>,
    ...(timeAgo
      ? [
          <Text
            key="time"
            style={{
              fontSize: 10,
              color: "rgba(255,255,255,0.55)",
              fontWeight: "500",
            }}
          >
            {timeAgo}
          </Text>,
        ]
      : []),
    ...(origLoc && !(orig as any).repostOfId
      ? [
          <Text
            key="loc"
            style={{
              fontSize: 10,
              color: "rgba(255,255,255,0.4)",
              fontWeight: "500",
            }}
            numberOfLines={1}
          >
            <Ionicons name="location" size={12} color="#fff" style={{ opacity: 0.8, marginRight: 2 }} />
            {origLoc.place ||
              `${(origLoc.lat ?? 0).toFixed(4)}, ${(origLoc.lon ?? 0).toFixed(4)}`}
          </Text>,
        ]
      : []),
    ...(hasAudio
      ? [
          <Text
            key="audio"
            style={{
              fontSize: 10,
              color: "rgba(255,255,255,0.4)",
              fontWeight: "500",
            }}
          >
            🎵 Original Audio
          </Text>,
        ]
      : []),
  ];

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => onPress(orig)}
      style={styles.repostPreview}
    >
      {/* Author row */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          marginBottom: 8,
        }}
      >
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            backgroundColor: "rgba(124,58,237,0.3)",
            overflow: "hidden",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {author.avatarUrl ? (
            <Image
              source={{ uri: author.avatarUrl }}
              style={{ width: 28, height: 28 }}
              contentFit="cover"
            />
          ) : (
            <Text style={{ fontSize: 13 }}>{author.avatar}</Text>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={{ fontSize: 12, fontWeight: "700", color: "#F1F5F9" }}
            numberOfLines={1}
          >
            {author.name}
          </Text>
          <RollingText items={rollItems} isActive={isActive ?? true} />
        </View>
      </View>
      {/* Title */}
      {(orig as any).title ? (
        <Text
          style={{
            fontSize: fontSizes.md,
            fontWeight: "700",
            color: "#F1F5F9",
            lineHeight: 21,
          }}
          numberOfLines={2}
        >
          {(orig as any).title}
        </Text>
      ) : null}
      {/* Content */}
      {(orig as any).content ? (
        <Text
          style={{
            fontSize: fontSizes.sm,
            color: "rgba(255,255,255,0.65)",
            lineHeight: 18,
            marginTop: (orig as any).title ? 4 : 0,
          }}
          numberOfLines={3}
        >
          {(orig as any).content}
        </Text>
      ) : null}
      {/* Media carousel */}
      {visual.length > 0 && (
        <View style={{ position: "relative", marginTop: 8 }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={previewW + 4}
            disableIntervalMomentum
            decelerationRate="fast"
            contentContainerStyle={{ gap: 4 }}
            onScroll={(e) => {
              const x = e.nativeEvent.contentOffset.x;
              const page = Math.max(
                0,
                Math.min(visual.length - 1, Math.round(x / (previewW + 4))),
              );
              if (page !== mediaPage) setMediaPage(page);
            }}
            scrollEventThrottle={16}
          >
            {visual.map((m: any, idx: number) => {
              const url = m.media_url;
              const isVid = m.media_type === "video" || m.type === "video";
              if (!url) return null;
              return (
                <View
                  key={idx}
                  style={{
                    width: previewW,
                    height: mediaH,
                    borderRadius: radii.sm,
                    overflow: "hidden",
                    backgroundColor: "#000",
                  }}
                >
                  {isVid ? (
                    <ActiveVideo
                      url={url}
                      width={previewW}
                      height={mediaH}
                      muted={true}
                    />
                  ) : (
                    <Image
                      source={{ uri: url }}
                      style={{ width: previewW, height: mediaH }}
                      contentFit="cover"
                    />
                  )}
                </View>
              );
            })}
          </ScrollView>
          {visual.length > 1 && (
            <View
              style={{
                position: "absolute",
                bottom: 8,
                left: 0,
                right: 0,
                flexDirection: "row",
                justifyContent: "center",
                gap: 5,
              }}
            >
              {visual.map((_: any, i: number) => (
                <View
                  key={i}
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor:
                      i === mediaPage ? "#fff" : "rgba(255,255,255,0.5)",
                  }}
                />
              ))}
            </View>
          )}
        </View>
      )}
      {pollData ? (
        <View style={{ marginTop: 8 }}>
          <PollBlock poll={pollData} myVote={myPollVote} onVote={handlePollVote} embedded />
        </View>
      ) : null}
      {((orig as any).likesCount ?? 0) +
        ((orig as any).commentsCount ?? 0) +
        ((orig as any).sharesCount ?? (orig as any).shares ?? 0) >
        0 && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 14,
            marginTop: 8,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
            <Ionicons
              name="heart-outline"
              size={13}
              color="rgba(255,255,255,0.4)"
            />
            <Text style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
              {(orig as any).likesCount ?? 0}
            </Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
            <Ionicons
              name="chatbubble-outline"
              size={12}
              color="rgba(255,255,255,0.4)"
            />
            <Text style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
              {(orig as any).commentsCount ?? 0}
            </Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
            <Ionicons name="repeat" size={12} color="rgba(255,255,255,0.4)" />
            <Text style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
              {(orig as any).sharesCount ?? (orig as any).shares ?? 0}
            </Text>
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
}

const MediaEdgeMask = ({
  children,
  width,
  height,
}: {
  children: React.ReactNode;
  width: number;
  height: number;
}) => {
  const fadeSize = Math.min(60, height * 0.009);
  const p1 = fadeSize / height;
  return (
    <MaskedView
      style={{ width, height }}
      maskElement={
        <LinearGradient
          colors={[
            "transparent",
            "rgba(0,0,0,0.04)",
            "rgba(0,0,0,0.16)",
            "rgba(0,0,0,0.36)",
            "rgba(0,0,0,0.64)",
            "black",
            "black",
            "rgba(0,0,0,0.64)",
            "rgba(0,0,0,0.36)",
            "rgba(0,0,0,0.16)",
            "rgba(0,0,0,0.04)",
            "transparent",
          ]}
          locations={[
            0,
            p1 * 0.2,
            p1 * 0.4,
            p1 * 0.6,
            p1 * 0.8,
            p1,
            1 - p1,
            1 - p1 + p1 * 0.2,
            1 - p1 + p1 * 0.4,
            1 - p1 + p1 * 0.6,
            1 - p1 + p1 * 0.8,
            1,
          ]}
          style={{ flex: 1 }}
        />
      }
    >
      {children}
    </MaskedView>
  );
};

const AmbientBackground = ({
  url,
  children,
  style,
}: {
  url?: string;
  children?: React.ReactNode;
  style?: any;
}) => {
  const safeUrl = url && url !== "null" && url !== "undefined" ? url : null;
  
  if (!safeUrl) {
    return (
      <View
        style={[
          { width: SCREEN_W, height: SCREEN_H, backgroundColor: "#000" },
          style,
        ]}
      >
        <Image
          source={require("../../../assets/icon.png")}
          style={[StyleSheet.absoluteFill, { opacity: 0.1 }]}
          contentFit="cover"
        />
        {children}
      </View>
    );
  }
  return (
    <View style={[{ width: SCREEN_W, height: SCREEN_H }, style]}>
      <Image
        source={{ uri: safeUrl }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        blurRadius={40}
      />
      <BlurView style={StyleSheet.absoluteFill} tint="dark" intensity={80} />
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: "rgba(0,0,0,0.5)" },
        ]}
      />
      <View
        style={[
          StyleSheet.absoluteFill,
          { justifyContent: "center", alignItems: "center" },
        ]}
      >
        {children}
      </View>
    </View>
  );
};

function ReelContent({
  post,
  isActive,
  isMuted,
  isPaused,
  onPinchStateChange,
  onRepostPress,
  overlayAnim,
  onPress,
  onPressIn,
  onPressOut,
  myPollVote,
  onPollVote,
  pollData,
  activeIndex,
  setActiveIndex,
}: {
  post: Post;
  isActive: boolean;
  isMuted?: boolean;
  isPaused?: boolean;
  onPinchStateChange?: (pinching: boolean) => void;
  onRepostPress?: (orig: Post) => void;
  overlayAnim: Animated.Value;
  onPress?: (e: any) => void;
  onPressIn?: (e: any) => void;
  onPressOut?: (e: any) => void;
  myPollVote?: number | null;
  onPollVote?: (optionIndex: number) => void;
  pollData?: any;
  activeIndex: number;
  setActiveIndex: (index: number) => void;
}) {
  const reelBg1 = "#000000";
  const reelBg2 = "#000000";
  const reelTextPrimary = "#F1F5F9";
  const isRepost = !!(post as any).repostOfId;
  const allMedia = (post as any).media || [];
  const visualMedia = allMedia.filter(
    (m: any) => m.media_type !== "audio" && m.type !== "audio",
  );
  const audioMedia = allMedia.filter(
    (m: any) => m.media_type === "audio" || m.type === "audio",
  );
  const hasCommonAudio = audioMedia.length > 0;
  const firstMedia = visualMedia[0] || allMedia[0];
  const isVideo =
    firstMedia?.media_type === "video" ||
    firstMedia?.type === "video" ||
    post.type === "video";
  const isAudio =
    firstMedia?.media_type === "audio" || firstMedia?.type === "audio" || (post as any).type === "audio";

  const rawMediaUrl = firstMedia?.media_url;
  const mediaUrl =
    rawMediaUrl && rawMediaUrl !== "null" && rawMediaUrl !== "undefined"
      ? rawMediaUrl
      : undefined;

  const rawPreviewUrl = firstMedia?.preview_url;
  const safePreviewUrl =
    rawPreviewUrl && rawPreviewUrl !== "null" && rawPreviewUrl !== "undefined"
      ? rawPreviewUrl
      : undefined;

  const getMediaDimensions = (m?: any) => {
    const w = m?.width || firstMedia?.width || 1080;
    const h = m?.height || firstMedia?.height || 1080;
    const ratio = w / h;
    let displayW = SCREEN_W;
    let displayH = SCREEN_W / ratio;
    if (displayH > SCREEN_H) {
      displayH = SCREEN_H;
      displayW = SCREEN_H * ratio;
    }
    return { width: displayW, height: displayH };
  };

  // Repost → show embedded preview of the original post
  if (isRepost) {
    return (
      <Pressable
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={StyleSheet.absoluteFill}
      >
        <AmbientBackground
          url={
            (post as any).mediaUri ||
            firstMedia?.preview_url ||
            firstMedia?.media_url
          }
        >
          <RepostedReelPreview
            post={post}
            isActive={isActive}
            onPress={(orig) => onRepostPress?.(orig)}
          />
        </AmbientBackground>
      </Pressable>
    );
  }

  // Multiple visual media → horizontal carousel
  if (visualMedia.length > 1) {
    return (
      <View style={{ width: SCREEN_W, height: SCREEN_H }}>
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          snapToInterval={SCREEN_W}
          decelerationRate="fast"
          onScroll={(e) => {
            const newIdx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
            setActiveIndex(newIdx);
          }}
          scrollEventThrottle={16}
        >
          {visualMedia.map((m: any, idx: number) => {
            const url = m.media_url;
            const isVid = m.media_type === "video" || m.type === "video";
            const dims = getMediaDimensions(m);
            return (
              <Pressable
                key={idx}
                onPress={onPress}
                onPressIn={onPressIn}
                onPressOut={onPressOut}
              >
                <AmbientBackground url={url || m.preview_url}>
                  <ZoomableMedia
                    width={dims.width}
                    height={dims.height}
                    onPinchStateChange={onPinchStateChange}
                  >
                    <MediaEdgeMask width={dims.width} height={dims.height}>
                      {isVid && url ? (
                        isActive ? (
                          <ActiveVideo
                            url={url}
                            width={dims.width}
                            height={dims.height}
                            muted={!!isMuted || idx !== activeIndex || hasCommonAudio}
                            loop
                            isPausedOverride={isPaused || idx !== activeIndex}
                          />
                        ) : (
                          <Image
                            source={{ uri: m.preview_url || url }}
                            style={{ width: dims.width, height: dims.height }}
                            contentFit="contain"
                          />
                        )
                      ) : url ? (
                        <Image
                          source={{ uri: url }}
                          style={{ width: dims.width, height: dims.height }}
                          contentFit="contain"
                          transition={200}
                        />
                      ) : null}
                    </MediaEdgeMask>
                  </ZoomableMedia>
                </AmbientBackground>
              </Pressable>
            );
          })}
        </ScrollView>
        <View
          style={{
            position: "absolute",
            bottom: 100,
            left: 0,
            right: 0,
            flexDirection: "row",
            justifyContent: "center",
            gap: 5,
          }}
        >
          {visualMedia.map((_: any, i: number) => (
            <View
              key={i}
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor:
                  i === activeIndex ? "#fff" : "rgba(255,255,255,0.4)",
              }}
            />
          ))}
        </View>
      </View>
    );
  }

  // Single video with pinch-to-zoom
  if (isVideo && mediaUrl) {
    const dims = getMediaDimensions();
    return (
      <Pressable
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={StyleSheet.absoluteFill}
      >
        <AmbientBackground url={safePreviewUrl || mediaUrl}>
          <ZoomableMedia
            width={dims.width}
            height={dims.height}
            onPinchStateChange={onPinchStateChange}
          >
            <MediaEdgeMask width={dims.width} height={dims.height}>
              {isActive ? (
                <ActiveVideo
                  url={mediaUrl}
                  width={dims.width}
                  height={dims.height}
                  muted={!!isMuted}
                  loop
                  isPausedOverride={isPaused}
                />
              ) : (
                <Image
                  source={{ uri: safePreviewUrl || mediaUrl }}
                  style={{ width: dims.width, height: dims.height }}
                  contentFit="contain"
                />
              )}
            </MediaEdgeMask>
          </ZoomableMedia>
        </AmbientBackground>
      </Pressable>
    );
  }

  if (isAudio && mediaUrl) {
    return (
      <Pressable
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={StyleSheet.absoluteFill}
      >
        <AmbientBackground url={safePreviewUrl}>
          {safePreviewUrl ? (
            <ZoomableMedia
              width={SCREEN_W}
              height={SCREEN_W}
              onPinchStateChange={onPinchStateChange}
            >
              <MediaEdgeMask width={SCREEN_W} height={SCREEN_W}>
                <Image
                  source={{ uri: safePreviewUrl }}
                  style={{ width: SCREEN_W, height: SCREEN_W }}
                  contentFit="cover"
                />
              </MediaEdgeMask>
            </ZoomableMedia>
          ) : null}
        </AmbientBackground>
      </Pressable>
    );
  }

  if (mediaUrl) {
    const dims = getMediaDimensions();
    return (
      <Pressable
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={StyleSheet.absoluteFill}
      >
        <AmbientBackground url={mediaUrl}>
          <ZoomableMedia
            width={dims.width}
            height={dims.height}
            onPinchStateChange={onPinchStateChange}
          >
            <MediaEdgeMask width={dims.width} height={dims.height}>
              <Image
                source={{ uri: mediaUrl }}
                style={{ width: dims.width, height: dims.height }}
                contentFit="contain"
                transition={200}
              />
            </MediaEdgeMask>
          </ZoomableMedia>
        </AmbientBackground>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={StyleSheet.absoluteFill}
    >
      <AmbientBackground
        url={
          (post as any).mediaUri ||
          safePreviewUrl ||
          mediaUrl
        }
      >
        {post.type === "poll" && (pollData || (post as any).pollData) ? (
          <View style={{ width: SCREEN_W - spacing.xl * 2 }}>
            <PollBlock
              poll={pollData || (post as any).pollData}
              myVote={myPollVote ?? (post as any).myPollVote ?? null}
              onVote={onPollVote}
            />
          </View>
        ) : null}
      </AmbientBackground>
    </Pressable>
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
  onReposted,
  showDelete,
  isProfileReel = false,
}: ReelItemProps) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();

  // Theme-aware reel colors
  const reelBg1 = "#000000";
  const reelBg2 = "#000000";
  const reelGradientColor = "#000000";
  const reelScrimTop = "rgba(0,0,0,0.55)";
  const reelScrimBottom = "rgba(0,0,0,0.65)";
  const reelTextPrimary = "#F1F5F9";
  const reelTextSecondary = "rgba(255,255,255,0.65)";
  const reelTextMuted = "rgba(255,255,255,0.5)";
  const reelTextContent = "rgba(255,255,255,0.90)";
  const reelIconColor = "#fff";
  const reelSheetBg = "#1a1a2e";
  const reelSheetBorder = "rgba(255,255,255,0.08)";
  const reelCardBg = "rgba(20,20,40,0.92)";
  const reelCardBorder = "rgba(124,58,237,0.35)";
  const reelTextShadow = "rgba(0,0,0,0.5)";

  const allMedia = (post as any).media || [];
  const hasMedia =
    allMedia.length > 0 ||
    !!(post as any).mediaUri ||
    (post.type === "image" && !!(post as any).image) ||
    post.type === "video";
  const [activeIndex, setActiveIndex] = useState(0);

  const visualMedia = allMedia.filter(
    (m: any) => m.media_type !== "audio" && m.type !== "audio",
  );
  const audioMedia = allMedia.filter(
    (m: any) => m.media_type === "audio" || m.type === "audio",
  );

  const hasCommonAudio = audioMedia.length > 0;
  const currentSlideMedia = visualMedia[activeIndex] || visualMedia[0] || allMedia[0];
  const currentSlideHasAudio = currentSlideMedia?.media_type === "video" || currentSlideMedia?.type === "video";

  const hasAudioContent = hasCommonAudio || currentSlideHasAudio || post.type === "video";
  const [isMuted, setIsMuted] = useState(true);
  const [isPinching, setIsPinching] = useState(false);

  // ── Video interaction states ──────────────────────────────────────────
  const [isPaused, setIsPaused] = useState(false);
  const [isContentExpanded, setIsContentExpanded] = useState(false);
  const [topOverlayHeight, setTopOverlayHeight] = useState<number>(0);

  // Animated overlay visibility — header slides up, footer slides down
  const overlayAnim = useRef(new Animated.Value(1)).current; // 1 = visible, 0 = hidden
  const overlaysVisibleRef = useRef(true);
  const [overlaysVisible, setOverlaysVisible] = useState(true); // for conditional rendering of Read more etc.

  const animateOverlays = useCallback(
    (show: boolean) => {
      overlaysVisibleRef.current = show;
      setOverlaysVisible(show);
      Animated.parallel([
        Animated.spring(overlayAnim, {
          toValue: show ? 1 : 0,
          tension: 65,
          friction: 11,
          useNativeDriver: true,
        }),
      ]).start();
    },
    [overlayAnim],
  );

  const [likersVisible, setLikersVisible] = useState(false);
  const [repostersVisible, setRepostersVisible] = useState(false);
  const [pollTrayVisible, setPollTrayVisible] = useState(false);

  const author = useMemo(() => {
    const raw = (post as any).author || {};
    return {
      id: raw.id,
      name: raw.name || "Unknown",
      username: raw.username || raw.handle || "",
      avatarUrl: raw.avatar_url?.cloudfront_url || raw.avatar_url,
      avatar: raw.avatar || "👾",
      xp: raw.xp ?? raw.totalXp ?? 0,
      organization: raw.organization || raw.bio || "",
    };
  }, [post]);

  const community = (post as any).community;
  const communityName = community?.name || (post as any).community_name;
  const communitySlug = community?.slug || (post as any).community_slug;
  const hasPoll = !!(post as any).pollData;
  const timeAgo = formatInstagramTime(
    (post as any).createdAt ||
      (post as any).created_at ||
      (post as any).publishedAt ||
      (post as any).published_at,
  );

  // ── XP pill state (matching PostHeader exactly) ───────────────────────
  const postId = String(post?.id || "");
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
    const allMediaItems = (post as any).media || [];
    const visualMedia = allMediaItems.filter(
      (m: any) => m.media_type !== "audio" && m.type !== "audio",
    );
    const audioMedia = allMediaItems.filter(
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

  const requiredTimeMs = useMemo(() => {
    let time = 3000;
    const allMediaItems = (post as any).media || [];
    allMediaItems.forEach((m: any) => {
      const isVideo = m.media_type === "video" || m.type === "video";
      if (isVideo) {
        const dur = (m.duration || m.videoDuration || 5000) as number;
        time += Math.min(dur, 10000);
      } else {
        time += 3000;
      }
    });
    return Math.min(15000, Math.max(3000, time));
  }, [post]);

  useEffect(() => {
    setIsClaimed((post as any).isXpClaimed || claimedPosts.has(postId));
  }, [postId]);

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

  const handleToggleMute = useCallback(() => {
    setIsMuted((m) => !m);
  }, []);

  const [pollData, setPollData] = useState<any>((post as any).pollData || null);
  const [myPollVote, setMyPollVote] = useState<number | null>(
    (post as any).myPollVote ?? null
  );

  useEffect(() => {
    setPollData((post as any).pollData || null);
    setMyPollVote((post as any).myPollVote ?? null);
  }, [post.id, (post as any).pollData]);

  const handlePollVote = useCallback(
    async (optionIndex: number) => {
      try {
        const res = await postsService.castPollVote(post.id, optionIndex);
        const data = res?.data || res;
        setMyPollVote(data?.myVote ?? null);
        if (data?.pollData) setPollData(data.pollData);
      } catch (e: any) {
        themedAlert(
          "Vote Error",
          e?.response?.data?.message || "Could not record your vote."
        );
      }
    },
    [post.id]
  );

  // ── Computed post state (needed by callbacks defined below) ──
  const likes = (post as any).likes ?? (post as any).likesCount ?? 0;
  const comments = (post as any).comments ?? (post as any).commentsCount ?? 0;
  const shares = (post as any).shares ?? (post as any).sharesCount ?? 0;
  const isLiked = !!post.isLiked;
  const isSaved = !!(post as any).isSaved;
  const isReposted = !!(post as any).repostedByMe;

  // ── Reset overlays when scrolling to this reel ──
  useEffect(() => {
    if (isActive) {
      animateOverlays(true);
      setIsContentExpanded(false);
    }
  }, [isActive, animateOverlays]);

  // ── Double-tap like: only call API if not already liked ──
  const handleDoubleTapLike = useCallback(() => {
    if (!isLiked) onLike(post.id);
  }, [isLiked, post.id, onLike]);

  // ── Heart burst animation (replaces old DoubleTapLike component) ──
  const heartScale = useRef(new Animated.Value(0)).current;
  const heartOpacity = useRef(new Animated.Value(0)).current;
  const [heartPos, setHeartPos] = useState({
    x: SCREEN_W / 2,
    y: SCREEN_H / 2,
  });

  const triggerHeartBurst = useCallback(
    (x: number, y: number) => {
      setHeartPos({ x, y });
      handleDoubleTapLike();
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
        Animated.delay(500),
        Animated.timing(heartOpacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start(() => heartScale.setValue(0));
    },
    [handleDoubleTapLike, heartScale, heartOpacity],
  );

  // ── Tap handling via Pressable (JS touch system — coexists with ZoomableMedia's native pinch) ──
  // Uses tap timing for single vs double detection.
  const lastTapRef = useRef(0);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleContentPress = useCallback(
    (e: any) => {
      if (isPinching) return;
      const now = Date.now();
      const locationX = e?.nativeEvent?.locationX ?? SCREEN_W / 2;
      const locationY = e?.nativeEvent?.locationY ?? SCREEN_H / 2;

      if (now - lastTapRef.current < 300) {
        // Double tap → like + heart burst
        triggerHeartBurst(locationX, locationY);
        lastTapRef.current = 0;
      } else {
        lastTapRef.current = now;
        // Wait to see if double-tap follows
        setTimeout(() => {
          if (
            lastTapRef.current !== 0 &&
            Date.now() - lastTapRef.current >= 280
          ) {
            // Single tap → toggle overlays with animation
            animateOverlays(!overlaysVisibleRef.current);
            lastTapRef.current = 0;
          }
        }, 300);
      }
    },
    [isPinching, triggerHeartBurst],
  );

  const handleContentLongPress = useCallback(() => {
    if (hasMedia) setIsPaused(true);
  }, [hasMedia]);

  const handleContentPressIn = useCallback(() => {
    if (!hasMedia) return;
    longPressTimerRef.current = setTimeout(() => {
      setIsPaused(true);
      animateOverlays(false); // long press also hides UI
    }, 400);
  }, [hasMedia, animateOverlays]);

  const handleContentPressOut = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    // Resume if paused by long-press (only if we set it)
    setIsPaused(false);
  }, []);

  const toggleOverlays = useCallback(() => {
    animateOverlays(!overlaysVisibleRef.current);
  }, [animateOverlays]);

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
      warn("Failed to share", e);
    }
  }, [post, author.name]);

  const handleDelete = useCallback(() => {
    themedAlert(
      "Delete post",
      "Are you sure you want to delete this post? This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => onDelete(post) },
      ],
    );
  }, [post, onDelete]);

  const handleReport = useCallback(() => {
    themedAlert(
      "Reported",
      "Thank you. This post has been reported for review.",
    );
    onReport(post);
  }, [post, onReport]);

  // ── Repost handler ──────────────────────────────────────────────────
  const [repostSheetVisible, setRepostSheetVisible] = useState(false);
  const [quoteText, setQuoteText] = useState("");
  const [repostBusy, setRepostBusy] = useState(false);
  const repostLitAnim = useRef(new Animated.Value(0)).current;
  const repostLitScale = useRef(new Animated.Value(1)).current;

  const handleRepost = useCallback(() => {
    setQuoteText("");
    setRepostSheetVisible(true);
  }, []);

  const handleRepostLongPress = useCallback(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(repostLitAnim, {
          toValue: 1,
          duration: 120,
          useNativeDriver: true,
        }),
        Animated.spring(repostLitScale, {
          toValue: 1.3,
          speed: 20,
          bounciness: 8,
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(repostLitAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(repostLitScale, {
          toValue: 1,
          speed: 12,
          bounciness: 6,
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => {
      setRepostersVisible(true);
    });
  }, [repostLitAnim, repostLitScale]);

  const doRepost = useCallback(
    async (content?: string) => {
      if (repostBusy) return;
      setRepostBusy(true);
      try {
        const repostCommunityId = (post as any).community?.id || undefined;
        await postsService.repostPost(post.id, content, {
          communityId: repostCommunityId,
        });
        setRepostSheetVisible(false);
        setQuoteText("");
        onReposted?.();
        queryClient.invalidateQueries({ queryKey: queryKeys.feed });
      } catch (e: any) {
        const msg = e?.response?.data?.message || "Failed to repost.";
        themedAlert("Repost", msg);
      } finally {
        setRepostBusy(false);
      }
    },
    [post, onReposted, queryClient, repostBusy],
  );

  // ── Close poll handler ──────────────────────────────────────────────
  const handleClosePoll = useCallback(() => {
    if (!postId || !pollData) return;
    themedAlert(
      "Close poll?",
      `Voting will be locked — ${pollData.options?.length || 0} option(s) keep their current tallies and nobody can vote anymore. This can't be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Close poll",
          style: "destructive",
          onPress: async () => {
            try {
              const res = await postsService.closePoll(postId);
              if (res?.data?.pollData) setPollData(res.data.pollData);
            } catch (e: any) {
              themedAlert(
                "Error",
                e?.response?.data?.message || "Could not close the poll.",
              );
            }
          },
        },
      ],
    );
  }, [postId, pollData]);

  // ── Rolling text items (matching PostHeader exactly) ──────────────────────
  const rollItems = useMemo(() => {
    const items: React.ReactNode[] = [];

    items.push(
      <Text key="username" style={styles.rollSubText} numberOfLines={1}>
        @{author.username}
        {communityName ? (
          <Text
            style={{ color: "#93C5FD", fontWeight: "700" }}
            onPress={(e: any) => {
              e.stopPropagation?.();
              if (communitySlug) {
                navigation.navigate(
                  "Community" as any,
                  {
                    screen: "CommunityDetail",
                    params: { communitySlug },
                  } as any,
                );
              }
            }}
          >
            {" "}
            • c/{communityName}
          </Text>
        ) : null}
      </Text>,
    );

    if (timeAgo) {
      items.push(
        <Text key="time" style={styles.rollSubText}>
          {timeAgo}
        </Text>,
      );
    }

    if ((post as any).location && !(post as any).repostOfId) {
      items.push(
        <Text key="location" style={styles.rollSubText} numberOfLines={1}>
          <Ionicons name="location" size={12} color="#fff" style={{ opacity: 0.8, marginRight: 2 }} />
          {(post as any).location?.place ||
            `${((post as any).location?.lat ?? 0).toFixed(4)}, ${((post as any).location?.lon ?? 0).toFixed(4)}`}
        </Text>,
      );
    }

    const hasAudio = allMedia.some(
      (m: any) => m.media_type === "audio" || m.type === "audio",
    );
    if (hasAudio && !(post as any).repostOfId) {
      items.push(
        <Text key="audio" style={styles.rollSubText}>
          🎵 Original Audio
        </Text>,
      );
    }

    return items;
  }, [
    post,
    author,
    communityName,
    communitySlug,
    timeAgo,
    allMedia,
    navigation,
  ]);

  // ── Menu options ────────────────────────────────────────────────────
  const [showMenu, setShowMenu] = useState(false);
  const menuOptions = useMemo(() => {
    const opts: {
      icon: string;
      label: string;
      color?: string;
      onPress: () => void;
    }[] = [];
    const postAuthorId =
      (post as any)?.author?.id ||
      (post as any)?.authorId ||
      (post as any)?.author_id ||
      "";
    const isAuthor =
      !!postAuthorId && String(postAuthorId) === String(currentUser?.id);

    if (pollData && !pollData.closed && isAuthor) {
      opts.push({
        icon: "bar-chart-outline",
        label: "Close poll",
        onPress: handleClosePoll,
      });
    }
    if (showDelete) {
      opts.push({
        icon: "trash-outline",
        label: "Delete",
        color: "#EF4444",
        onPress: handleDelete,
      });
    }
    opts.push({
      icon: "flag-outline",
      label: "Report",
      color: "#EF4444",
      onPress: handleReport,
    });

    return opts;
  }, [
    pollData,
    currentUser?.id,
    postId,
    post,
    showDelete,
    handleDelete,
    handleReport,
    handleClosePoll,
  ]);

  // ── Navigate to original reel when tapping a repost preview ──────────────
  const handleRepostPress = useCallback(
    (orig: Post) => {
      postsService
        .getFeed(1, 1)
        .then(() => {})
        .catch(() => {});
      navigation.navigate("PostDetail", {
        post: orig,
        feedPosts: [orig],
        feedContext: "home",
        isSinglePost: true,
      } as any);
    },
    [navigation],
  );

  return (
    <View style={[styles.cell, { width: SCREEN_W, height: SCREEN_H }]}>
      {/* ── Layer 1: Content ── */}
      <View style={StyleSheet.absoluteFill}>
        <ReelContent
          post={post}
          isActive={isActive}
          isMuted={isMuted}
          isPaused={isPaused}
          onPinchStateChange={setIsPinching}
          onRepostPress={handleRepostPress}
          overlayAnim={overlayAnim}
          onPress={isActive ? handleContentPress : undefined}
          onPressIn={isActive ? handleContentPressIn : undefined}
          onPressOut={isActive ? handleContentPressOut : undefined}
          myPollVote={myPollVote}
          onPollVote={handlePollVote}
          pollData={pollData}
          activeIndex={activeIndex}
          setActiveIndex={setActiveIndex}
        />
      </View>

      {/* ── Layer 1.6: Heart burst animation (pointerEvents=none) ── */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.heartBurst,
          {
            left: heartPos.x - 48,
            top: heartPos.y - 48,
            opacity: heartOpacity,
            transform: [{ scale: heartScale }],
          },
        ]}
      >
        <Ionicons
          name="heart"
          size={96}
          color="#7C3AED"
          style={{
            textShadowColor: "rgba(0,0,0,0.4)",
            textShadowOffset: { width: 0, height: 4 },
            textShadowRadius: 8,
          }}
        />
      </Animated.View>

      {/* ── Layer 2: Top scrim ── */}
      <Animated.View
        style={[
          styles.topScrim,
          {
            height:
              topOverlayHeight > 0
                ? insets.top + 8 + topOverlayHeight + 40
                : isContentExpanded
                  ? SCREEN_H * 0.5
                  : SCREEN_H * 0.25,
            opacity: overlayAnim,
          },
        ]}
        pointerEvents="none"
      >
        <LinearGradient
          colors={[
            reelGradientColor,
            `${reelGradientColor}FC`,
            `${reelGradientColor}CE`,
            `${reelGradientColor}A3`,
            `${reelGradientColor}7D`,
            `${reelGradientColor}5C`,
            `${reelGradientColor}3F`,
            `${reelGradientColor}28`,
            `${reelGradientColor}17`,
            `${reelGradientColor}0A`,
            `${reelGradientColor}02`,
            `${reelGradientColor}00`,
          ]}
          locations={[
            0,
            topOverlayHeight > 0
              ? (insets.top + 8 + 44) / (insets.top + 8 + topOverlayHeight + 40)
              : 0.2,
            topOverlayHeight > 0
              ? (insets.top + 8 + 44 + (topOverlayHeight - 4) * 0.1) /
                (insets.top + 8 + topOverlayHeight + 40)
              : 0.28,
            topOverlayHeight > 0
              ? (insets.top + 8 + 44 + (topOverlayHeight - 4) * 0.2) /
                (insets.top + 8 + topOverlayHeight + 40)
              : 0.36,
            topOverlayHeight > 0
              ? (insets.top + 8 + 44 + (topOverlayHeight - 4) * 0.3) /
                (insets.top + 8 + topOverlayHeight + 40)
              : 0.44,
            topOverlayHeight > 0
              ? (insets.top + 8 + 44 + (topOverlayHeight - 4) * 0.4) /
                (insets.top + 8 + topOverlayHeight + 40)
              : 0.52,
            topOverlayHeight > 0
              ? (insets.top + 8 + 44 + (topOverlayHeight - 4) * 0.5) /
                (insets.top + 8 + topOverlayHeight + 40)
              : 0.6,
            topOverlayHeight > 0
              ? (insets.top + 8 + 44 + (topOverlayHeight - 4) * 0.6) /
                (insets.top + 8 + topOverlayHeight + 40)
              : 0.68,
            topOverlayHeight > 0
              ? (insets.top + 8 + 44 + (topOverlayHeight - 4) * 0.7) /
                (insets.top + 8 + topOverlayHeight + 40)
              : 0.76,
            topOverlayHeight > 0
              ? (insets.top + 8 + 44 + (topOverlayHeight - 4) * 0.8) /
                (insets.top + 8 + topOverlayHeight + 40)
              : 0.84,
            topOverlayHeight > 0
              ? (insets.top + 8 + 44 + (topOverlayHeight - 4) * 0.9) /
                (insets.top + 8 + topOverlayHeight + 40)
              : 0.92,
            1,
          ]}
          style={{ flex: 1 }}
        />
      </Animated.View>

      {/* ── Layer 2: Top overlay — slides up when hiding ── */}
      <Animated.View
        pointerEvents={overlaysVisible ? "box-none" : "none"}
        onLayout={(e) => setTopOverlayHeight(e.nativeEvent.layout.height)}
        style={[
          styles.topOverlay,
          {
            top: insets.top + 8,
            opacity: overlayAnim,
            transform: [
              {
                translateY: overlayAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-60, 0],
                }),
              },
            ],
          },
        ]}
      >
        <View style={styles.authorRow}>
          <View style={{ position: "relative" }}>
            <TouchableOpacity
              onPress={() => onAuthorPress(post)}
              activeOpacity={0.7}
            >
              <View style={styles.avatar}>
                {author.avatarUrl ? (
                  <Image
                    source={{ uri: author.avatarUrl }}
                    style={{ width: 44, height: 44, borderRadius: 22 }}
                    contentFit="cover"
                  />
                ) : (
                  <Text style={{ fontSize: 18 }}>{author.avatar}</Text>
                )}
              </View>
            </TouchableOpacity>
            <ActiveStatusDot
              userId={author.id || undefined}
              size={12}
              style={{ bottom: -2, right: -2 }}
            />
          </View>
          <View style={styles.meta}>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
            >
              <TouchableOpacity
                onPress={() => onAuthorPress(post)}
                activeOpacity={0.7}
                style={{ flexShrink: 1 }}
              >
                <Text style={styles.authorName} numberOfLines={1}>
                  {author.name}
                </Text>
              </TouchableOpacity>
              <View style={{ flex: 1 }} />

              {showPill && (
                <Animated.View
                  style={[
                    styles.xpPill,
                    {
                      paddingHorizontal: 0,
                      paddingVertical: 0,
                      overflow: "hidden",
                      opacity: pillOpacity,
                    },
                    isClaimed && {
                      borderColor: "rgba(34,197,94,0.35)",
                      backgroundColor: "rgba(34,197,94,0.1)",
                    },
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
                        width: progressAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: ["0%", "100%"],
                        }),
                      }}
                    />
                  )}
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 3,
                      paddingVertical: 2,
                      paddingHorizontal: 6,
                    }}
                  >
                    {isClaimed ? (
                      <Ionicons
                        name="checkmark-circle"
                        size={12}
                        color="#22c55e"
                      />
                    ) : (
                      <Text style={{ fontSize: 10 }}>⚡</Text>
                    )}
                    <Text
                      style={[styles.xpText, isClaimed && { color: "#22c55e" }]}
                    >
                      {rewardXp} XP
                    </Text>
                  </View>
                </Animated.View>
              )}

              <TouchableOpacity
                onPress={() => setShowMenu(true)}
                style={{ padding: 2 }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons
                  name="ellipsis-vertical"
                  size={15}
                  color="rgba(255,255,255,0.6)"
                />
              </TouchableOpacity>
            </View>
            <RollingText items={rollItems} isActive={isActive} />
          </View>
        </View>

        {/* ── Text content area (Flows naturally below author row) ── */}
        {((post as any).title || post.content) && (
          <View style={{ marginTop: 12 }} pointerEvents="box-none">
            {(post as any).title ? (
              <Text
                style={{
                  fontSize: fontSizes.lg,
                  fontWeight: "800",
                  color: "#F1F5F9",
                  marginBottom: 4,
                  lineHeight: 24,
                }}
                numberOfLines={isContentExpanded ? undefined : 2}
              >
                {(post as any).title}
              </Text>
            ) : null}
            {post.content ? (
              <>
                <ParsedReelText
                  text={post.content}
                  onMentionPress={(name) =>
                    navigation.push("UserProfile", { user: { username: name } })
                  }
                  onHashtagPress={(tag) =>
                    navigation.navigate("Search", {
                      query: tag,
                      tab: "hashtags",
                    })
                  }
                  onCommunityPress={(slug) =>
                    navigation.navigate(
                      "Community" as any,
                      {
                        screen: "CommunityDetail",
                        params: { communitySlug: slug },
                      } as any,
                    )
                  }
                  numberOfLines={isContentExpanded ? undefined : 2}
                />
                {!isContentExpanded && post.content.length > 80 && (
                  <TouchableOpacity
                    onPress={() => setIsContentExpanded(true)}
                    activeOpacity={0.7}
                    style={{ marginTop: 4 }}
                  >
                    <Text
                      style={{
                        fontSize: fontSizes.xs,
                        fontWeight: "700",
                        color: "rgba(255,255,255,0.5)",
                      }}
                    >
                      Read more
                    </Text>
                  </TouchableOpacity>
                )}
                {isContentExpanded && post.content.length > 80 && (
                  <TouchableOpacity
                    onPress={() => setIsContentExpanded(false)}
                    activeOpacity={0.7}
                    style={{ marginTop: 4 }}
                  >
                    <Text
                      style={{
                        fontSize: fontSizes.xs,
                        fontWeight: "700",
                        color: "rgba(255,255,255,0.5)",
                      }}
                    >
                      Show less
                    </Text>
                  </TouchableOpacity>
                )}
              </>
            ) : null}
          </View>
        )}
      </Animated.View>

      {/* ── Layer 3: Bottom scrim + actions — slides down when hiding ── */}
      <Animated.View
        style={[
          styles.bottomScrim,
          {
            height: insets.bottom + 8 + 24 + 40,
            opacity: overlayAnim,
          },
        ]}
        pointerEvents="none"
      >
        <LinearGradient
          colors={[
            `${reelGradientColor}00`,
            `${reelGradientColor}02`,
            `${reelGradientColor}0A`,
            `${reelGradientColor}17`,
            `${reelGradientColor}28`,
            `${reelGradientColor}3F`,
            `${reelGradientColor}5C`,
            `${reelGradientColor}7D`,
            `${reelGradientColor}A3`,
            `${reelGradientColor}CE`,
            `${reelGradientColor}FC`,
            reelGradientColor,
          ]}
          locations={[
            0,
            4 / (insets.bottom + 8 + 24 + 40),
            8 / (insets.bottom + 8 + 24 + 40),
            12 / (insets.bottom + 8 + 24 + 40),
            16 / (insets.bottom + 8 + 24 + 40),
            20 / (insets.bottom + 8 + 24 + 40),
            24 / (insets.bottom + 8 + 24 + 40),
            28 / (insets.bottom + 8 + 24 + 40),
            32 / (insets.bottom + 8 + 24 + 40),
            36 / (insets.bottom + 8 + 24 + 40),
            40 / (insets.bottom + 8 + 24 + 40),
            1,
          ]}
          style={{ flex: 1 }}
        />
      </Animated.View>

      <Animated.View
        style={[
          styles.bottomActions,
          {
            bottom: insets.bottom + 8,
            opacity: overlayAnim,
            transform: [
              {
                translateY: overlayAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [80, 0],
                }),
              },
            ],
          },
        ]}
        pointerEvents={overlaysVisible ? "box-none" : "none"}
      >
        {/* Like */}
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => onLike(post.id)}
          activeOpacity={0.7}
        >
          <Ionicons
            name={isLiked ? "heart" : "heart-outline"}
            size={20}
            color={isLiked ? "#9F67F7" : "#fff"}
          />
          <TouchableOpacity
            onPress={() => setLikersVisible(true)}
            activeOpacity={0.7}
          >
            <Text style={[styles.actionCount, isLiked && { color: "#9F67F7" }]}>
              {formatCount(likes)}
            </Text>
          </TouchableOpacity>
        </TouchableOpacity>

        {/* Comment */}
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => onCommentPress(post)}
          activeOpacity={0.7}
        >
          <Ionicons name="chatbubble-outline" size={20} color={"#fff"} />
          <Text style={styles.actionCount}>{formatCount(comments)}</Text>
        </TouchableOpacity>

        {/* Poll icon */}
        {hasPoll && (
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => setPollTrayVisible(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="bar-chart" size={20} color="#FBBF24" />
          </TouchableOpacity>
        )}

        {/* Repost */}
        <View style={styles.actionBtn}>
          <TouchableOpacity
            onPress={handleRepost}
            onLongPress={handleRepostLongPress}
            delayLongPress={300}
            activeOpacity={0.7}
          >
            {isReposted ? (
              <Animated.View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 2,
                  transform: [{ scale: repostLitScale }],
                  opacity: Animated.add(
                    1,
                    repostLitAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, 0.5],
                    }),
                  ),
                }}
              >
                <Ionicons name="repeat" size={20} color="#9F67F7" />
              </Animated.View>
            ) : (
              <Animated.View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  transform: [{ scale: repostLitScale }],
                  opacity: repostLitAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, 0.3],
                  }),
                }}
              >
                <Ionicons name="repeat-outline" size={20} color={"#fff"} />
              </Animated.View>
            )}
          </TouchableOpacity>
          {shares > 0 && (
            <TouchableOpacity
              onPress={() => setRepostersVisible(true)}
              activeOpacity={0.7}
            >
              <Text
                style={[styles.actionCount, isReposted && { color: "#9F67F7" }]}
              >
                {formatCount(shares)}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Share */}
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={onShareProp || (() => handleShare())}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-redo-outline" size={20} color={"#fff"} />
        </TouchableOpacity>

        {/* Save */}
        <TouchableOpacity
          style={[styles.actionBtn, { marginLeft: "auto" }]}
          onPress={() => onSave(post.id)}
          activeOpacity={0.7}
        >
          <Ionicons
            name={isSaved ? "bookmark" : "bookmark-outline"}
            size={20}
            color={isSaved ? "#9F67F7" : "#fff"}
          />
        </TouchableOpacity>

        {/* ── Mute toggle (Inline, right aligned) ── */}
        {hasAudioContent && (
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={handleToggleMute}
            activeOpacity={0.7}
          >
            <Ionicons
              name={isMuted ? "volume-mute" : "volume-high"}
              size={20}
              color={"#fff"}
            />
          </TouchableOpacity>
        )}
      </Animated.View>

      {/* ── Menu sheet ── */}
      <PostMenuSheet
        visible={showMenu}
        onClose={() => setShowMenu(false)}
        options={menuOptions}
      />

      {/* ── Modals ── */}
      <UsersModal
        visible={likersVisible}
        postId={post.id}
        title="Likes"
        emptyText="No likes yet."
        fetchPage={(id, pg, lim) => postsService.getLikers(id, pg, lim)}
        onClose={() => setLikersVisible(false)}
      />
      <UsersModal
        visible={repostersVisible}
        postId={post.id}
        title="Reposts"
        emptyText="No reposts yet."
        fetchPage={(id, pg, lim) => postsService.getReposters(id, pg, lim)}
        onClose={() => setRepostersVisible(false)}
      />

      {/* ── Poll tray ── */}
      <Modal
        visible={pollTrayVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setPollTrayVisible(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setPollTrayVisible(false)}
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "flex-end",
          }}
        >
          <View
            onStartShouldSetResponder={() => true}
            style={{
              backgroundColor: colors.card,
              borderTopLeftRadius: radii.xl,
              borderTopRightRadius: radii.xl,
              padding: spacing.lg,
              paddingBottom: insets.bottom + 16,
              maxHeight: "60%",
            }}
          >
            <View
              style={{
                alignSelf: "center",
                width: 40,
                height: 4,
                borderRadius: 2,
                marginBottom: 12,
                backgroundColor: colors.border,
              }}
            />
            <Text
              style={{
                fontSize: fontSizes.lg,
                fontWeight: "800",
                color: colors.text,
                marginBottom: 12,
              }}
            >
              Poll
            </Text>
            <PollBlock
              poll={pollData || (post as any).pollData}
              myVote={myPollVote ?? (post as any).myPollVote ?? null}
              onVote={handlePollVote}
              embedded
            />
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Repost sheet ── */}
      <Modal
        visible={repostSheetVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRepostSheetVisible(false)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: reelSheetBg,
              justifyContent: "flex-end",
            }}
          >
            <TouchableWithoutFeedback
              onPress={() => setRepostSheetVisible(false)}
            >
              <View style={StyleSheet.absoluteFill} />
            </TouchableWithoutFeedback>
            <View
              style={{
                backgroundColor: "#1a1a2e",
                borderTopLeftRadius: radii.xl,
                borderTopRightRadius: radii.xl,
                paddingHorizontal: spacing.lg,
                paddingTop: spacing.md,
                paddingBottom: insets.bottom + 16,
                maxHeight: "70%",
              }}
            >
              <View
                style={{
                  alignSelf: "center",
                  width: 40,
                  height: 4,
                  borderRadius: 2,
                  marginBottom: 10,
                  backgroundColor: "rgba(255,255,255,0.15)",
                }}
              />
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: spacing.sm,
                }}
              >
                <Text
                  style={{
                    fontSize: fontSizes.lg,
                    fontWeight: "800",
                    color: "#F1F5F9",
                  }}
                >
                  Repost
                </Text>
                <TouchableOpacity onPress={() => setRepostSheetVisible(false)}>
                  <Ionicons
                    name="close"
                    size={22}
                    color="rgba(255,255,255,0.5)"
                  />
                </TouchableOpacity>
              </View>
              <TextInput
                style={{
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.12)",
                  borderRadius: radii.md,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  fontSize: fontSizes.sm,
                  color: "#F1F5F9",
                  backgroundColor: "rgba(255,255,255,0.06)",
                  minHeight: 60,
                  textAlignVertical: "top",
                }}
                placeholder="Quote something..."
                placeholderTextColor="rgba(255,255,255,0.3)"
                multiline
                value={quoteText}
                onChangeText={setQuoteText}
                maxLength={500}
              />
              <TouchableOpacity
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  paddingVertical: 13,
                  borderRadius: 999,
                  marginTop: 12,
                  backgroundColor: "#7C3AED",
                }}
                disabled={repostBusy}
                onPress={() => doRepost(quoteText.trim() || undefined)}
              >
                <Ionicons name="repeat" size={18} color={"#fff"} />
                <Text
                  style={{
                    color: "#F1F5F9",
                    fontSize: fontSizes.md,
                    fontWeight: "800",
                  }}
                >
                  {repostBusy
                    ? "Reposting…"
                    : quoteText.trim()
                      ? "Post"
                      : "Repost"}
                </Text>
              </TouchableOpacity>
              {isReposted && (
                <TouchableOpacity
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    paddingVertical: 12,
                    borderRadius: 999,
                    borderWidth: 1,
                    marginTop: 10,
                    borderColor: "rgba(255,255,255,0.12)",
                    backgroundColor: "rgba(255,255,255,0.04)",
                  }}
                  onPress={() => {
                    setRepostSheetVisible(false);
                  }}
                >
                  <Ionicons name="repeat" size={16} color="#7C3AED" />
                  <Text
                    style={{
                      fontSize: fontSizes.md,
                      fontWeight: "700",
                      color: "#7C3AED",
                    }}
                  >
                    View my reposts
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
});

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  cell: { overflow: "hidden" },

  // Content
  textContent: { paddingHorizontal: spacing.xl, alignItems: "center" },
  postText: {
    fontSize: fontSizes.xl,
    fontWeight: "500",
    lineHeight: 30,
    textAlign: "center",
    letterSpacing: 0.2,
  },
  postTitle: {
    fontSize: 28,
    fontWeight: "800",
    textAlign: "center",
    paddingHorizontal: spacing.xl,
    marginBottom: 16,
    lineHeight: 36,
  },

  // Heart burst (double-tap) — purple like PostCard
  heartBurst: {
    position: "absolute",
    width: 96,
    height: 96,
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "none",
    zIndex: 200,
  },

  // Repost preview card
  repostPreview: {
    width: SCREEN_W - 48,
    alignSelf: "center",
    borderWidth: 1.5,
    borderColor: "rgba(124,58,237,0.35)",
    backgroundColor: "rgba(20,20,40,0.92)",
    borderRadius: radii.lg,
    padding: 14,
    marginTop: 16,
  },

  // Top scrim + overlay
  topScrim: { position: "absolute", top: 0, left: 0, right: 0 },
  topOverlay: { position: "absolute", left: spacing.md, right: spacing.md },

  // Author identity — matches PostHeader exactly
  authorRow: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(124,58,237,0.4)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  meta: { flex: 1 },
  authorName: {
    fontSize: fontSizes.sm,
    fontWeight: "700",
    color: "#F1F5F9",
    textShadowColor: "rgba(0,0,0,0.55)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },

  // Rolling text sub-text
  rollSubText: {
    fontSize: fontSizes.xs,
    color: "rgba(255,255,255,0.65)",
    fontWeight: "500",
    marginTop: 0,
    textShadowColor: "rgba(0,0,0,0.45)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },

  // XP Pill
  xpPill: {
    backgroundColor: "rgba(251,191,36,0.11)",
    borderWidth: 1,
    borderColor: "rgba(251,191,36,0.24)",
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 999,
  },
  xpText: { fontSize: fontSizes.xs, fontWeight: "800", color: "#FBBF24" },

  // Content text area
  contentArea: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg + 50,
  },
  contentTitle: {
    fontSize: fontSizes.md,
    fontWeight: "800",
    color: "#F1F5F9",
    marginBottom: 4,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    textAlign: "left",
  },
  parsedText: {
    fontSize: fontSizes.sm,
    color: "rgba(255,255,255,0.90)",
    lineHeight: 20,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    textAlign: "left",
  },
  linkText: { color: "#93C5FD", fontWeight: "700" },
  communityLinkText: { color: "#67E8F9", fontWeight: "700" },

  // Bottom
  bottomScrim: { position: "absolute", bottom: 0, left: 0, right: 0 },
  bottomActions: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
  },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 5 },
  actionCount: {
    fontSize: fontSizes.sm,
    fontWeight: "700",
    color: "#F1F5F9",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});
