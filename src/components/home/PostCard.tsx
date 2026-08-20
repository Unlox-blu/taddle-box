import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
  Animated,
  Dimensions,
  ScrollView,

  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  FlatList,
  TextInput,
} from "react-native";
import { VideoView, useVideoPlayer } from "expo-video";
import { Image } from "expo-image";
import { useEvent } from "expo";
import PostMenuSheet from './PostMenuSheet';
import { AudiencePickerList } from '../common/AudiencePicker';
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
import { userService } from "../../services/user.service";
import { queryKeys } from "../../lib/queryKeys";
import ActiveStatusDot from "../common/ActiveStatusDot";
import PollBlock from "../common/PollBlock";
import SmartInput from "../common/SmartInput";
import { useMyCommunities } from "../../queries/communities";
import { themedAlert } from '../common/ThemedAlert';

const SCREEN_W = Dimensions.get("window").width;
const CARD_W = SCREEN_W - spacing.lg * 2;
const claimedPosts = new Set<string>();
// Repost audience sentinel — the repost sheet starts with NO destination
// selected (unlike before, where Feed was a silent default). null = not chosen
// yet, REPOST_FEED_AUDIENCE = the user's Feed, a real id = a community.
const REPOST_FEED_AUDIENCE = "__feed__";
let globalIsMuted = true;

interface PostCardProps {
  post: Post;
  onLike?: (id: string) => void;
  onSave?: (id: string) => void;
  onComment?: (post: Post) => void;
  onShare?: (post: Post) => void;
  onAuthorPress?: (post: Post) => void;
  /** Called with the created repost so the feed can refresh. */
  onReposted?: (post: any) => void;
  isActive?: boolean;
  index?: number;
  /** Show the view count (profile page only — never in feed/community). */
  showViews?: boolean;
  /** When the card is rendered inside its own detail page, single-tap body
      navigation is disabled (it would push a duplicate page). */
  disableTapNavigation?: boolean;
  /** Detail-page mode — drops the box (margins/bg/border/radius) so the card
      spans the full screen width and media goes edge-to-edge. */
  fullBleed?: boolean;
  onDelete?: (post: Post) => void;
  onReport?: (post: Post) => void;
  showDelete?: boolean;
}

// React.memo: only re-renders when props actually change.
// With stable callbacks from SharedFeed, this prevents cascade
// re-renders across all visible PostCards when one card updates.
export default React.memo(PostCardInner);

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    card: {
      marginHorizontal: spacing.lg,
      marginBottom: spacing.md,
      backgroundColor: c.bg.card,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: c.border,
    },
    // Detail-page mode: flush with the page, no box chrome — only a hairline
    // under the card so the transition into the comment thread stays clear.
    cardFullBleed: {
      marginHorizontal: 0,
      marginBottom: 0,
      backgroundColor: 'transparent',
      borderRadius: 0,
      borderWidth: 0,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
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
    toastOverlay: {
      flex: 1,
      alignItems: "center",
      paddingTop: 64, // clear the header / status bar
    },
    toastPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: radii.full,
      borderWidth: 1,
      shadowColor: "#000",
      shadowOpacity: 0.18,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
      elevation: 4,
    },
    toastText: {
      fontSize: fontSizes.sm,
      fontWeight: "600",
    },
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

/** Feed video — expo-video replacement for the expo-av <Video> tag.
 *  Mute/play state is applied imperatively to the player (expo-video has no
 *  declarative props), and duration is reported once the source is ready. */
function FeedVideo({
  url,
  width,
  height,
  active,
  muted,
  loop = true,
  onDuration,
}: {
  url: string;
  width: number;
  height: number;
  active: boolean;
  muted: boolean;
  loop?: boolean;
  onDuration?: (durationMillis: number) => void;
}) {
  const player = useVideoPlayer({ uri: url }, (p) => {
    p.loop = loop;
  });
  useEffect(() => {
    player.muted = muted;
  }, [player, muted]);
  useEffect(() => {
    if (active) player.play();
    else player.pause();
  }, [player, active]);
  // Release native video player when the card unmounts (scrolls off-screen).
  // Without this, each video holds a native player instance in memory even
  // after the PostCard is recycled by FlashList.
  useEffect(() => {
    return () => {
      try { player.release(); } catch { /* best-effort */ }
    };
  }, [player]);
  // Report duration once ready (replaces expo-av's onLoad). The callback is
  // kept in a ref so re-renders can't re-report and inflate extraVideoTime.
  const durationRef = useRef(onDuration);
  durationRef.current = onDuration;
  const { status } = useEvent(player, "statusChange", { status: player.status });
  useEffect(() => {
    if (status === "readyToPlay" && player.duration > 0) {
      durationRef.current?.(player.duration * 1000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);
  return (
    <VideoView
      player={player}
      style={{ width, height }}
      contentFit="contain"
      nativeControls={false}
    />
  );
}

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

  // Items are ReactNodes — a raw string or number child would be rendered
  // directly inside a View and trigger RN's "Text strings must be rendered
  // within a <Text> component" error. Wrap only raw values in <Text>;
  // element items (e.g. the audio row) pass through untouched.
  const wrap = (node: React.ReactNode, key: React.Key) => {
    if (typeof node === "string" || typeof node === "number") {
      return (
        <Text key={key} style={{ lineHeight: 16 }}>
          {node}
        </Text>
      );
    }
    // An array that carries raw strings would otherwise leak them into the
    // wrapping View — coerce each entry the same way.
    if (Array.isArray(node)) {
      return (
        <React.Fragment key={key}>
          {node.map((n, i) =>
            typeof n === "string" || typeof n === "number" ? (
              <Text key={i} style={{ lineHeight: 16 }}>
                {n}
              </Text>
            ) : (
              <React.Fragment key={i}>{n}</React.Fragment>
            ),
          )}
        </React.Fragment>
      );
    }
    return <React.Fragment key={key}>{node}</React.Fragment>;
  };

  if (items.length === 0) return null;
  if (items.length === 1)
    return (
      <View style={{ height: 16, justifyContent: "center", marginTop: -2 }}>
        {wrap(items[0], "single")}
      </View>
    );

  // Append a duplicate of the first item to enable seamless looping
  const displayItems = [...items, items[0]];

  return (
    <View style={{ height: 16, overflow: "hidden", marginTop: -2 }}>
      <Animated.View style={{ transform: [{ translateY }] }}>
        {displayItems.map((item, i) => (
          <View key={i} style={{ height: 16, justifyContent: "center" }}>
            {wrap(item, i)}
          </View>
        ))}
      </Animated.View>
    </View>
  );
};

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
}: PostCardProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const scale = useRef(new Animated.Value(1)).current;
  const navigation =
    useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const { user: currentUser } = useAuth();
  // Repost state must stay in sync across every surface (feed, profile,
  // community, search) — reposting anywhere invalidates the cached feeds so
  // returning to them shows the updated state instead of a stale icon.
  const queryClient = useQueryClient();

  const [currentMediaPage, setCurrentMediaPage] = React.useState(0);
  const postId = String(post?.id || "");

  // ── Poll state ─────────────────────────────────────────────────────────
  // Tally + the user's selection live here so a vote updates the bars
  // immediately; the server response is the source of truth. Lists don't
  // carry myPollVote (only the detail query joins it), so the highlight
  // appears right after the user votes in this session.
  const [pollData, setPollData] = useState((post as any)?.pollData || null);
  const [myPollVote, setMyPollVote] = useState<number | null>(
    (post as any)?.myPollVote ?? null,
  );
  // Flat lists recycle card instances — reset when the card is reused.
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
        // myVote is null when the tap toggled the vote OFF — clear the
        // highlight in that case too (not just when a new vote lands).
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

  // ── Toast ──────────────────────────────────────────────────────────────
  // Brief confirmations for async actions (e.g. "Poll closed"). Modal-based
  // so the pill floats above the list no matter where the card is scrolled.
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const showToast = useCallback(
    (msg: string) => {
      setToastMsg(msg);
      Animated.sequence([
        Animated.timing(toastOpacity, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.delay(1800),
        Animated.timing(toastOpacity, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) setToastMsg(null);
      });
    },
    [toastOpacity],
  );

  // Only the poll author can close it — the server enforces this too. Always
  // confirm first: closing is permanent and locks out every voter.
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
              showToast("Poll closed");
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
  }, [postId, pollData, showToast]);

  // Overflow menu contents: Close poll (author, open poll) + the existing
  // Delete / Report action. Rendered in PostMenuSheet, a bottom sheet.
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
        onPress: () => handleClosePoll(),
      });
    }
    if (showDelete) {
      opts.push({
        icon: "trash-outline",
        label: "Delete",
        color: "#ef4444",
        onPress: () => onDelete?.(post),
      });
    } else {
      opts.push({
        icon: "flag-outline",
        label: "Report",
        onPress: () => onReport?.(post),
      });
    }
    return opts;
  }, [pollData, showDelete, currentUser?.id, handleClosePoll, post, onDelete, onReport]);
  // Full-bleed (detail page) media spans the whole screen; otherwise the card
  // width (screen minus side margins) drives it.
  const mediaW = fullBleed ? SCREEN_W : CARD_W;
  // Tapping a repost (the preview OR its comment action) opens the ORIGINAL
  // post's thread — never the repost's own (empty) comments. The root is
  // resolved on demand via the cache-aware resolveRootPost (which also walks
  // repost-of-repost chains), so a cold tap before the preview's fetch lands
  // still lands on the true original.
  const openPostThread = useCallback(
    async (target: Post) => {
      const targetId = String((target as any)?.repostOfId || "");
      const root = targetId ? await resolveRootPost(targetId) : null;
      const dest = root && !root?.repostOfId ? root : target;
      // push (not navigate): a detail page may already be on the stack (e.g.
      // viewing a repost's preview inside its own detail page) — navigate
      // would jump BACK to that instance and collapse the back stack, so
      // back would skip screens. push always opens a fresh page.
      navigation.push("PostDetail", { post: dest as Post } as any);
    },
    [navigation],
  );
  const author = useMemo(() => {
    const raw = (post as any)?.author || {};
    return {
      id: raw.id || (post as any)?.authorId || (post as any)?.author_id || "",
      name: raw.name || (post as any)?.authorName || (post as any)?.author_name || "Unknown User",
      username: raw.username || (post as any)?.authorUsername || (post as any)?.author_username || "unknown",
      avatarUrl: raw.avatarUrl || raw.avatar_url || (post as any)?.authorAvatar || (post as any)?.author_avatar,
      avatar: raw.avatar || "👾",
      // False when the author turned "Allow Reposting" off — hides the repost
      // button. Defaults to true when the payload doesn't carry it.
      repostsEnabled:
        (raw.repostsEnabled ??
          (post as any)?.authorRepostsEnabled ??
          (post as any)?.author_reposts_enabled) !== false,
    };
  }, [post]);

  // Repost sheet visibility — declared before useMyCommunities below so the
  // community fetch stays gated (on-demand): it must not fire at app open,
  // only when a repost sheet is actually opened.
  const [repostSheetVisible, setRepostSheetVisible] = React.useState(false);

  // Destination communities for reposts — same list as the create-post
  // audience picker (joined + owned). Backed by the react-query cache (the
  // CommunityContext was never mounted, so this used to be always empty).
  const myCommunities = useMyCommunities(repostSheetVisible);
  const repostCommunities = myCommunities.filter(
    (c) => c.isJoined || c.ownerId === currentUser?.id,
  );

  // Private communities show a small lock icon next to the community name so
  // the viewer knows the post lives in a members-only space.
  const communityPrivacy =
    typeof post.community === "object"
      ? (post.community as any)?.privacy
      : undefined;

  // Community "Allow Reposting" toggle (owner-controlled). Defaults to true
  // when the payload doesn't carry it (non-community posts / older payloads).
  const communityRepostsEnabled =
    typeof post.community !== "object" || !post.community
      ? true
      : (post.community as any)?.repostsEnabled !== false;

  // A repost (verbatim or quote) is only possible when BOTH the author and
  // the community allow reposting. There is NO manage/edit flow — reposting
  // always creates a NEW repost row (multiple reposts allowed, one audience
  // each); changing or removing a repost is done from the profile's Reposts
  // tab. Mirrors the feed button's gate exactly, so the sheet's submit can
  // never offer something the button wouldn't have shown. Kept as a sheet-
  // level guard (defense in depth): a stale payload or a toggle flipped
  // while the sheet is open can't sneak a submit past it.
  const canSubmitNewRepost =
    author.repostsEnabled !== false && communityRepostsEnabled;

  // Destination picker for reposts — Feed or one of the user's communities,
  // same as the create-post flow. No destination is pre-selected: the user must
  // explicitly choose (Feed or a community) before Repost/Post works, and a
  // pill error + shake fires otherwise — exactly like the create-post flow.
  const renderAudienceSection = () => {
    // The Feed destination mirrors the account type — public accounts post to
    // everyone, private accounts only to their approved followers (same as the
    // create-post audience picker).
    const isPrivateAccount = (currentUser as any)?.privacy === 'private';
    const feedLabel = isPrivateAccount ? 'Followers' : 'Public';
    const feedMeta = isPrivateAccount
      ? 'Only your approved followers can see this'
      : 'Anyone on Taddle can see this';
    const feedIcon = isPrivateAccount ? 'lock-closed-outline' : 'globe-outline';
    const feedSelected = repostCommunityId === REPOST_FEED_AUDIENCE;
    const selectedAudienceName = feedSelected
      ? feedLabel
      : repostCommunityId
        ? repostCommunityName ||
          repostCommunities.find((c) => c.id === repostCommunityId)?.name ||
          'Community'
        : null;
    return (
    <Animated.View
      style={{
        borderTopWidth: 1,
        borderTopColor: colors.border,
        paddingTop: 10,
        marginTop: 4,
        transform: [{ translateX: repostAudienceAnim }],
      }}
    >
      <TouchableOpacity
        style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 6 }}
        onPress={() => setAudienceExpanded((v) => !v)}
        activeOpacity={0.7}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Ionicons
            name={feedSelected ? feedIcon : repostCommunityId ? "people-outline" : "radio-button-off-outline"}
            size={16}
            color={repostCommunityId ? colors.primaryLight : colors.text.secondary}
          />
          <Text style={{ fontSize: fontSizes.sm, fontWeight: "800", color: colors.text.primary }}>
            Select audience
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text
            style={{
              fontSize: fontSizes.xs,
              fontWeight: selectedAudienceName ? "700" : "500",
              color: selectedAudienceName ? colors.text.muted : "rgba(148,163,184,0.8)",
            }}
            numberOfLines={1}
          >
            {selectedAudienceName || "Not selected"}
          </Text>
          <Ionicons
            name={audienceExpanded ? "chevron-up" : "chevron-down"}
            size={15}
            color={colors.text.muted}
          />
        </View>
      </TouchableOpacity>

      {audienceExpanded && (
        <View style={{ marginTop: 6, height: 230 }}>
          <AudiencePickerList
            selectedId={feedSelected ? null : repostCommunityId === null ? undefined : repostCommunityId}
            onSelect={(id, comm) => {
              // null from the picker = the Feed row was tapped.
              setRepostCommunityId(id === null ? REPOST_FEED_AUDIENCE : id);
              setRepostCommunityName(id ? (comm?.name || null) : null);
              setRepostAudienceError(null);
            }}
            feedLabel={feedLabel}
            feedMeta={feedMeta}
            feedIcon={feedIcon}
          />
        </View>
      )}

      {/* Pill error — create-post style: shake + red pill under the audience
          row when Repost/Post is tapped with no destination chosen. */}
      {repostAudienceError && (
        <Animated.View
          pointerEvents="none"
          style={[sheetStyles.repostErrorPop, { opacity: repostAudienceOpacity }]}
        >
          <Ionicons name="alert-circle" size={13} color="#fff" style={{ marginRight: 5 }} />
          <Text style={sheetStyles.repostErrorPopText}>{repostAudienceError}</Text>
        </Animated.View>
      )}
    </Animated.View>
    );
  };

  if (post.isXpClaimed) {
    claimedPosts.add(postId);
  }
  const [isClaimed, setIsClaimed] = React.useState(post.isXpClaimed || claimedPosts.has(postId));
  const [showPill, setShowPill] = React.useState(true);
  const [showMenu, setShowMenu] = React.useState(false);
  const [extraVideoTime, setExtraVideoTime] = React.useState(0);
  const [isMuted, setIsMuted] = React.useState(globalIsMuted);
  const [isExpanded, setIsExpanded] = React.useState(false);
  const [repostCommunityId, setRepostCommunityId] = React.useState<string | null>(null);
  const [repostCommunityName, setRepostCommunityName] = React.useState<string | null>(null);
  const [audienceExpanded, setAudienceExpanded] = React.useState(false);
  const [likersVisible, setLikersVisible] = React.useState(false);
  const [repostersVisible, setRepostersVisible] = React.useState(false);
  // Poll option whose voters list is open (null = closed). Kept as the index
  // so long-pressing a different option swaps the list cleanly.
  const [votersOption, setVotersOption] = React.useState<number | null>(null);
  // The repost CARD keeps its OWN engagement — every repost row carries its
  // own likes/comments/shares counters (the original's numbers live only in the
  // embedded preview below, as a peek; tapping the preview opens the original).
  // True once the embedded preview resolves and finds the ORIGINAL post is
  // gone (deleted/404) — hides the Repost action so nobody can reshare
  // unavailable content (the button is meaningless there anyway).
  const [origUnavailable, setOrigUnavailable] = React.useState(false);
  const displayLikes = post.likes ?? (post as any).likesCount ?? 0;
  const displayComments = post.comments ?? (post as any).commentsCount ?? 0;
  const displayShares = post.shares ?? (post as any).sharesCount ?? 0;
  // Quote text lives in the repost sheet itself — empty = verbatim repost,
  // typed = quote repost (create-post style content with # and @ support).
  const [quoteText, setQuoteText] = React.useState("");
  const [repostBusy, setRepostBusy] = React.useState(false);
  // Audience validation — no destination is pre-selected; a shake + pill error
  // (same pattern as create post) fires if the user hits Repost/Post without
  // choosing one.
  const [repostAudienceError, setRepostAudienceError] = React.useState<string | null>(null);
  const repostAudienceAnim = React.useRef(new Animated.Value(0)).current;
  const repostAudienceOpacity = React.useRef(new Animated.Value(0)).current;
  const repostAudienceTimer = React.useRef<any>(null);
  const progressAnim = useRef(new Animated.Value(claimedPosts.has(postId) ? 1 : 0)).current;
  const doubleTapAnim = useRef(new Animated.Value(0)).current;
  const pillOpacity = useRef(new Animated.Value(1)).current;
  const isPillVisible = useRef(true);
  const lastTapTime = useRef(0);

  // Parse confirmed mentions/hashtags out of SmartInput's raw value so the
  // quote repost supports them exactly like a normal post.
  const extractQuoteTags = (raw: string): string[] => {
    const plainText = raw.replace(/\{#\}\[([^\]]+)\]\([^)]+\)/g, "#$1");
    return Array.from(new Set(
      Array.from(plainText.matchAll(/(?:^|\s)(#[a-z0-9_]+)/gi)).map(m => m[1].replace("#", "").toLowerCase()),
    ));
  };
  const extractQuoteMentions = (raw: string): string[] => {
    const matches = Array.from(raw.matchAll(/\{@\}\[([^\]]+)\]\(([^)]+)\)/g));
    return Array.from(new Set(matches.map(m => m[2])));
  };

  // Flip repost state + share count on THIS post inside every react-query
  // cache (feed + hashtag variants, profile, community, search, bookmarks) so
  // the repost icon updates instantly across all surfaces — not just after a
  // refetch.
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
                const current =
                  p.shares ?? p.sharesCount ?? 0;
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
      queryClient.getQueryCache().findAll({ queryKey: queryKeys.feed })
        .forEach(apply);
      queryClient.getQueryCache().findAll({ queryKey: ['bookmarks'] })
        .forEach(apply);
      queryClient.getQueryCache().findAll({ queryKey: ['profile'] })
        .forEach(apply);
      queryClient.getQueryCache().findAll({ queryKey: ['community'] })
        .forEach(apply);
      queryClient.getQueryCache().findAll({ queryKey: ['search'] })
        .forEach(apply);
    },
    [queryClient, postId],
  );

  // Audience not chosen yet → shake the row + show the create-post style pill.
  const showRepostAudienceError = () => {
    const isPrivateAccount = (currentUser as any)?.privacy === 'private';
    const msg = isPrivateAccount
      ? "Choose where to post — Followers or a Community"
      : "Choose where to post — Public or a Community";
    setRepostAudienceError(msg);
    if (repostAudienceTimer.current) clearTimeout(repostAudienceTimer.current);
    repostAudienceAnim.setValue(0);
    Animated.sequence([
      Animated.timing(repostAudienceAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(repostAudienceAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(repostAudienceAnim, { toValue: 6, duration: 60, useNativeDriver: true }),
      Animated.timing(repostAudienceAnim, { toValue: -4, duration: 60, useNativeDriver: true }),
      Animated.timing(repostAudienceAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
    repostAudienceOpacity.setValue(0);
    Animated.spring(repostAudienceOpacity, {
      toValue: 1,
      friction: 6,
      tension: 80,
      useNativeDriver: true,
    }).start();
    repostAudienceTimer.current = setTimeout(() => {
      Animated.timing(repostAudienceOpacity, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }).start(() => setRepostAudienceError(null));
    }, 2600);
  };

  const doRepost = async (content?: string) => {
    if (repostBusy) return;
    // No destination chosen yet — same validation gate as create post.
    if (!repostCommunityId) {
      setAudienceExpanded(true);
      showRepostAudienceError();
      return;
    }
    setRepostBusy(true);
    try {
      const res = await postsService.repostPost(postId, content, {
        tags: content ? extractQuoteTags(content) : [],
        mentions: content ? extractQuoteMentions(content) : [],
        communityId: repostCommunityId === REPOST_FEED_AUDIENCE ? undefined : repostCommunityId,
      });
      setRepostSheetVisible(false);
      setQuoteText("");
      // Optimistic flip — icon shows reposted state before any refetch.
      // MULTIPLE-REPOST semantics: every repost creates a NEW row and bumps
      // the original's share count by one, so the flip is +1 even when the
      // viewer already reposted.
      flipRepostInCaches(true, 1);
      onReposted?.(res?.data || null);
      queryClient.invalidateQueries({ queryKey: queryKeys.feed });
    } catch (e) {
      // Roll back the optimistic flip so the icon doesn't stay desynced.
      flipRepostInCaches(false, -1);
      // Surface the server's real reason (e.g. "This community has disabled
      // reposting on its posts") instead of a generic failure — a stale card
      // that still offers Repost needs to explain the 403.
      const msg =
        (e as any)?.response?.data?.message || "Failed to repost. Please try again.";
      themedAlert("Error", msg);
      console.warn("Repost failed", e);
    } finally {
      setRepostBusy(false);
    }
  };

  // Always open the repost sheet — verbatim Repost or a Quote via the
  // "Quote something..." input at the top (which supports #tags/@mentions).
  // Reposting always creates a NEW repost row (multiple reposts allowed);
  // managing or removing existing reposts is done from the profile's Reposts
  // tab.
  const handleRepostToggle = () => {
    setRepostCommunityId(null);
    setRepostCommunityName(null);
    setAudienceExpanded(false);
    setRepostAudienceError(null);
    setRepostSheetVisible(true);
  };

  // "View my reposts" — the viewer has already reposted this post somewhere,
  // so open Search pre-scoped exactly like a manual query: @me + @author pills
  // (each its own chip) and the original post's title as the free text. The
  // backend matches repost rows via their ORIGINAL's text, so the result set
  // is every repost the viewer made of this post (across all communities) plus
  // the original itself. Same chip/query mechanism as manual typing, so the
  // pills can be edited or removed and the search adapts.
  const handleViewMyReposts = () => {
    setRepostSheetVisible(false);
    // Skip the "unknown" placeholder when the payload carried no author info.
    const people = [
      currentUser?.username,
      author.username && author.username !== "unknown" ? author.username : "",
    ].filter(Boolean);
    const params: any = { tab: "f-all" };
    if (people.length) params.authorFilter = people.join(",");
    // Strip mention/hashtag markup out of the title so it lands as plain text.
    const text = String((post as any)?.title || "")
      .replace(/\{#\}\[([^\]]+)\]\([^)]+\)/g, "#$1")
      .replace(/\{@\}\[([^\]]+)\]\([^)]+\)/g, "@$1")
      .trim();
    if (text) params.query = text;
    navigation.navigate("Search", params);
  };

  // Single tap runs the given action (Instagram-style); a quick second tap is a
  // double-tap → like. The 300ms window matches handleDoubleTap's own
  // threshold, so the two never fight. registerTap (below) is the shared
  // detector — the body text/media AND the embedded repost preview both route
  // their taps through it, so double-tap-to-like works even where the preview's
  // own touchable would otherwise swallow both taps.
  const tapNavTimer = React.useRef<any>(null);
  const openPostDetail = React.useCallback(() => {
    // push (not navigate): see openPostThread — a detail page may already be
    // in the stack (e.g. from a profile grid opened off a detail page), and
    // navigate would pop back to it, skipping the screens in between.
    navigation.push("PostDetail", { post } as any);
  }, [navigation, post]);

  // Tapping the EMPTY space of the action row (padding/gaps around the buttons)
  // opens the detail page too — the buttons still win because the innermost
  // touchable claims the press. Inside the post's own detail page this is a
  // no-op, same as the body tap.
  const handleFooterTap = () => {
    if (disableTapNavigation) return;
    openPostDetail();
  };

  // Body text / media tap — single opens the detail page, double likes.
  const handleBodyTap = () => {
    // Inside the post's own detail page single-tap navigation is disabled,
    // but double-tap to like still works (registerTap records the first tap).
    registerTap(() => {
      if (disableTapNavigation) return;
      openPostDetail();
    });
  };

  const handleDoubleTap = () => {
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
  };

  // Shared double-tap detector — first tap schedules onSingleTap after 300ms;
  // a second tap inside the window cancels it and likes instead. Both the body
  // and the embedded repost preview route through here so the two areas stay
  // in sync (e.g. first tap on the body, second on the preview still counts).
  const registerTap = React.useCallback((onSingleTap: () => void) => {
    const now = Date.now();
    if (now - lastTapTime.current < 300) {
      // Double tap → like (cancel any pending single-tap navigation).
      if (tapNavTimer.current) {
        clearTimeout(tapNavTimer.current);
        tapNavTimer.current = null;
      }
      lastTapTime.current = 0; // reset so a 3rd tap doesn't re-trigger
      handleDoubleTap();
      return;
    }
    // First tap — record time, then wait briefly to see if a second tap follows.
    lastTapTime.current = now;
    if (tapNavTimer.current) clearTimeout(tapNavTimer.current);
    tapNavTimer.current = setTimeout(() => {
      tapNavTimer.current = null;
      onSingleTap();
    }, 300);
  }, [handleDoubleTap]);

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
          xpService.creditXP(rewardXp, "earned", `view_post_${postId}`).catch(() => {});
        }
      });
    } else {
      progressAnim.stopAnimation();
      progressAnim.setValue(0);
    }
  }, [isActive, requiredTimeMs, isClaimed, rewardXp]);

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
                      user: {
                        id,
                        name,
                        username: name,
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
                  // Hashtag taps open Search on the HASHTAGS tab with the tag
                  // pre-filled — not the generic All tab.
                  onPress={() => navigation.navigate("Search", { query: tag, tab: "hashtags" })}
                >
                  #{tag}
                </Text>
              );
            }

            const communityMatch = part.match(/^\{c\/\}\[([^\]]+)\]\(([^)]+)\)$/);
            if (communityMatch) {
              const name = communityMatch[1];
              const id = communityMatch[2];
              return (
                <Text
                  key={i}
                  style={{ color: colors.cyanLight, fontWeight: "700" }}
                  onPress={() =>
                    navigation.navigate("Community" as any, {
                      screen: "CommunityDetail",
                      params: { communitySlug: name },
                    } as any)
                  }
                >
                  c/{name}
                </Text>
              );
            }

            const plainCommunityMatch = part.match(/^c\/([a-z0-9_]+)$/i);
            if (plainCommunityMatch) {
              const slug = plainCommunityMatch[1];
              return (
                <Text
                  key={i}
                  style={{ color: colors.cyanLight, fontWeight: "700" }}
                  onPress={() =>
                    navigation.navigate("Community" as any, {
                      screen: "CommunityDetail",
                      params: { communitySlug: slug },
                    } as any)
                  }
                >
                  c/{slug}
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
                      user: {
                        id: part.slice(1),
                        name: part.slice(1),
                        username: part.slice(1),
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
                  onPress={() =>
                    navigation.navigate("Search", {
                      query: part.replace("#", ""),
                      tab: "hashtags",
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
    <View
      style={[
        styles.card,
        fullBleed && styles.cardFullBleed,
        { zIndex: showMenu ? 99 : 1, elevation: showMenu ? 99 : 1 }
      ]}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.authorRow}
          onPress={() => onAuthorPress?.(post)}
          activeOpacity={0.7}
        >
          <View style={{ position: "relative" }}>
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
            {/* Online / recently-active indicator (followed users only) — small
                and tucked into the avatar corner so it never crowds the ring */}
            <ActiveStatusDot
              userId={author.id || undefined}
              size={12}
              style={{ bottom: -2, right: -2 }}
            />
          </View>
          <View style={styles.meta}>
            {/* Top row: author name + XP pill + three-dot menu */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Text style={[styles.author, { flex: 1 }]} numberOfLines={1}>
                {author.name}
              </Text>

              {/* XP Pill */}
              {showPill && (
                <Animated.View style={[
                  styles.xpPill,
                  {
                    paddingHorizontal: 0, paddingVertical: 0, overflow: 'hidden',
                    opacity: pillOpacity,
                  },
                  isClaimed && { borderColor: 'rgba(34,197,94,0.35)', backgroundColor: 'rgba(34,197,94,0.1)' }
                ]}>
                  {!isClaimed && (
                    <Animated.View
                      style={{
                        position: 'absolute',
                        left: 0, top: 0, bottom: 0,
                        backgroundColor: 'rgba(251,191,36,0.3)',
                        width: progressAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: ['0%', '100%']
                        })
                      }}
                    />
                  )}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 2, paddingHorizontal: 6 }}>
                    {isClaimed ? (
                      <Ionicons name="checkmark-circle" size={12} color="#22c55e" />
                    ) : (
                      <Text style={{ fontSize: 10 }}>⚡</Text>
                    )}
                    <Text style={[styles.xpText, isClaimed && { color: '#22c55e' }]}>
                      {index === 0 && !isActive
                        ? (isClaimed ? `Earned ${rewardXp} XP` : `View to Earn`)
                        : `${rewardXp} XP`}
                    </Text>
                  </View>
                </Animated.View>
              )}

              {/* Three dot menu — same row, small */}
              {/* Three dot menu — same row, small */}
              <View style={{ position: "relative" }}>
                <TouchableOpacity
                  onPress={() => setShowMenu(!showMenu)}
                  style={{ padding: 2 }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="ellipsis-vertical" size={15} color={colors.text.muted} />
                </TouchableOpacity>
              </View>
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
                          navigation.navigate('Community' as any, {
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
              // Optional place tag — pin + place name (or coordinates offline).
              // Reposts intentionally do NOT show it here: the embedded preview
              // inside the card already shows the ORIGINAL post's location in
              // its own rolling text, so repeating it in the outer line would be
              // duplicate. The backend still carries the original's location on
              // the repost row (detail view, bookmarks, search all read it) —
              // only this rolling line skips it.
              if ((post as any).location && !(post as any).repostOfId) {
                rollItems.push(
                  <View
                    key="location"
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <Ionicons
                      name="location"
                      size={12}
                      color={colors.text.muted}
                    />
                    <Text
                      style={{
                        color: colors.text.muted,
                        fontSize: fontSizes.xs,
                        fontWeight: "500",
                      }}
                      numberOfLines={1}
                    >
                      {(post as any).location?.place ||
                        `${((post as any).location?.lat ?? 0).toFixed(4)}, ${((post as any).location?.lon ?? 0).toFixed(4)}`}
                    </Text>
                  </View>,
                );
              }
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
      <TouchableWithoutFeedback onPress={handleBodyTap}>
        <View style={[styles.body, { paddingTop: 0 }]}>
          {!!(post as any).title &&
            renderParsedText((post as any).title, styles.title, isExpanded ? undefined : 2)}
          {!!post.content && renderParsedText((post as any).highlight_content || post.content, styles.content, isExpanded ? undefined : contentLimitLines)}

          {!isExpanded && Boolean(((post as any).title && (post as any).title.length > 80) || (post.content && post.content.length > contentCharLimit)) && (
            <TouchableOpacity onPress={() => setIsExpanded(true)} style={{ marginTop: -4, marginBottom: 8 }} activeOpacity={0.7}>
              <Text style={{ color: colors.text.muted, fontSize: fontSizes.sm, fontWeight: '600' }}>Read more...</Text>
            </TouchableOpacity>
          )}

          {/* Reposted original preview (verbatim + quote reposts) */}
          {(post as any).repostOfId ? (
          <RepostedPostCard
            postId={(post as any).repostOfId}
            wrapperId={post.id}
            isActive={isActive ?? true}
            onOpen={(orig) => openPostThread(orig as Post)}
            onOrigUnavailable={() => setOrigUnavailable(true)}
            // Route the preview's taps through the SAME double-tap detector
            // as the body/media — otherwise the preview's own touchable
            // swallows both taps and double-tap-to-like dies on repost cards.
            onTap={(singleTap) => registerTap(singleTap)}
          />
          ) : null}
        </View>
      </TouchableWithoutFeedback>

      {/* Multi-Media Banner */}
      {(() => {
        const allMedia = (post as any).media || [];
        if (allMedia.length === 0) {
          return post.mediaUri ? (
            <Image
              source={{ uri: post.mediaUri }}
              style={{ width: mediaW, height: previewH, backgroundColor: "#000" }}
              contentFit="contain"
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
                snapToInterval={mediaW}
                decelerationRate="fast"
                onScroll={(e) => {
                  const x = e.nativeEvent.contentOffset.x;
                  const page = Math.max(
                    0,
                    Math.min(renderMedia.length - 1, Math.round(x / mediaW))
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
                      <TouchableWithoutFeedback key={idx} onPress={handleBodyTap}>
                        <View
                          style={{
                            width: mediaW,
                            height: previewH,
                            backgroundColor: "#000",
                          }}
                        >
                          <FeedVideo
                            url={url}
                            width={mediaW}
                            height={previewH}
                            active={isActive ?? true}
                            muted={isMuted || hasAudioTrack}
                            loop
                            onDuration={(ms) =>
                              setExtraVideoTime(prev => prev + ms)
                            }
                          />
                        </View>
                      </TouchableWithoutFeedback>
                    );
                  }
                  return url ? (
                    <TouchableWithoutFeedback key={idx} onPress={handleBodyTap}>
                      <Image
                        source={{ uri: url }}
                        style={{
                          width: mediaW,
                          height: previewH,
                          backgroundColor: "#000",
                        }}
                        contentFit="contain"
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
                    <FeedVideo
                      key={`bg-audio-${idx}`}
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

      {/* Poll (question + options + vote bars) — BELOW the media, so the
          visual content leads and the poll sits at the bottom of the card.
          Poll taps register a vote directly on the card — nested
          TouchableOpacity wins over the body's single/double-tap detector. */}
      {pollData ? (
        <PollBlock
          poll={pollData}
          myVote={myPollVote}
          onVote={handlePollVote}
          onShowVoters={setVotersOption}
          embedded
          inset
        />
      ) : null}

      {/* Actions — the row itself is tappable (empty space opens the detail
          page); each button inside still handles its own press. */}
      <TouchableWithoutFeedback onPress={handleFooterTap}>
      <View style={styles.actions}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <TouchableOpacity style={styles.action} onPress={handleLike}>
            <Animated.View style={{ transform: [{ scale }] }}>
              <Ionicons
                name={post.isLiked ? "heart" : "heart-outline"}
                size={20}
                color={post.isLiked ? colors.primaryLight : colors.text.muted}
              />
            </Animated.View>
          </TouchableOpacity>
          {/* Tap the like count to see who liked this post */}
          <TouchableOpacity
            style={styles.action}
            onPress={() => setLikersVisible(true)}
          >
            <Text
              style={[
                styles.actionText,
                post.isLiked && { color: colors.primaryLight },
              ]}
            >
              {displayLikes.toLocaleString()}
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.action}
          onPress={() => {
            // The comment bubble acts on the REPOST's own thread (the repost
            // has its own comments). The embedded preview below is the door to
            // the ORIGINAL — tapping it opens the original's thread.
            onComment?.(post);
          }}
        >
          <Ionicons
            name="chatbubble-outline"
            size={18}
            color={colors.text.muted}
          />
          <Text style={styles.actionText}>
            {displayComments.toLocaleString()}
          </Text>
        </TouchableOpacity>
        {/* Repost — icon + count together, gap:2 so they're close. Hidden on
            reposted cards (reposts can't be reposted themselves) and when the
            author disabled reposting. Uniform interaction on every post, own
            or not: PRESS opens the repost sheet (repost / repost-again /
            quote), LONG-PRESS opens the reposters list. */}
        {!post.repostOfId &&
          !origUnavailable &&
          (author.repostsEnabled !== false || post.repostedByMe) &&
          (communityRepostsEnabled || post.repostedByMe) && (
          <TouchableOpacity
            style={styles.action}
            onPress={handleRepostToggle}
            onLongPress={() => setRepostersVisible(true)}
            disabled={repostBusy}
          >
            {post.repostedByMe ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                <Ionicons name="repeat" size={19} color={colors.primaryLight} />
                <Ionicons
                  name="checkmark-circle"
                  size={10}
                  color={colors.success}
                  style={{ marginLeft: -6, marginTop: -8 }}
                />
                {/* Count stays visible in the reposted state too — the tick
                    confirms the action, the number stays next to the icon. */}
                <Text style={[styles.actionText, { color: colors.primaryLight }]}>
                  {displayShares.toLocaleString()}
                </Text>
              </View>
            ) : (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                <Ionicons name="repeat-outline" size={19} color={colors.text.muted} />
                <Text
                  style={[
                    styles.actionText,
                  ]}
                >
                  {displayShares.toLocaleString()}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.action}
          onPress={() => onShare?.(post)}
        >
          <Ionicons
            name="arrow-redo-outline"
            size={18}
            color={colors.text.muted}
          />
          <Text style={styles.actionText}>Share</Text>
        </TouchableOpacity>

        {showViews && (
          // Read-only view count — only rendered on the profile page.
          <View style={styles.action}>
            <Ionicons name="eye-outline" size={17} color={colors.text.muted} />
            <Text style={styles.actionText}>
              {(post as any).viewsCount ?? (post as any).views ?? 0}
            </Text>
          </View>
        )}

        <View style={styles.spacer} />

        <TouchableOpacity onPress={() => onSave?.(postId)}>
          <Ionicons
            name={post.isSaved ? "bookmark" : "bookmark-outline"}
            size={20}
            color={post.isSaved ? colors.primary : colors.text.muted}
          />
        </TouchableOpacity>
      </View>
      </TouchableWithoutFeedback>

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

      {/* ── Likers: who liked this post ── */}
      <UsersModal
        visible={likersVisible}
        postId={postId}
        title="Likes"
        emptyText="No likes yet."
        fetchPage={(id, page, limit) => postsService.getLikers(id, page, limit)}
        onClose={() => setLikersVisible(false)}
      />

      {/* ── Reposters: who reposted this post ── */}
      <UsersModal
        visible={repostersVisible}
        postId={postId}
        title="Reposts"
        emptyText="No reposts yet."
        fetchPage={(id, page, limit) => postsService.getReposters(id, page, limit)}
        onClose={() => setRepostersVisible(false)}
      />

      {/* ── Poll voters: who voted for one option (long-press the option).
          Mounted only while open so switching options reloads the list. */}
      {votersOption != null && pollData?.options?.[votersOption] ? (
        <UsersModal
          visible
          postId={postId}
          title={`Voters · ${(pollData.options[votersOption]?.text || `Option ${votersOption + 1}`).slice(0, 24)}`}
          emptyText="No votes on this option yet."
          fetchPage={(id, page, limit) =>
            postsService.getPollVoters(id, votersOption, page, limit)
          }
          onClose={() => setVotersOption(null)}
        />
      ) : null}

      {/* ── Repost sheet: repost verbatim or quote ── */}
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
        <View style={sheetStyles.backdrop}>
          {/* Backdrop tap target — only the area OUTSIDE the sheet closes it */}
          <TouchableWithoutFeedback onPress={() => setRepostSheetVisible(false)}>
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>
          <View
            style={[
              sheetStyles.sheet,
              { backgroundColor: colors.bg.card, borderColor: colors.border },
            ]}
          >
              <View
                style={[sheetStyles.dragHandle, { backgroundColor: colors.borderHover }]}
              />
              <View style={sheetStyles.sheetHeader}>
                <Text style={[sheetStyles.sheetHeaderTitle, { color: colors.text.primary }]}>
                  Repost
                </Text>
                <TouchableOpacity
                  style={[sheetStyles.sheetClose, { backgroundColor: colors.bg.elevated }]}
                  onPress={() => setRepostSheetVisible(false)}
                >
                  <Ionicons name="close" size={18} color={colors.text.secondary} />
                </TouchableOpacity>
              </View>

              {/* Quote input + audience — for ANY post the viewer can repost
                  (including their own — cross-posting into a community is
                  allowed). Every repost is a NEW row with one audience. */}
              {(
                <>
                  <SmartInput
                    style={[sheetStyles.composerInput, { color: colors.text.primary }]}
                    containerStyle={[
                      sheetStyles.composerInputWrap,
                      { backgroundColor: colors.bg.surface },
                    ]}
                    placeholder="Quote something..."
                    placeholderTextColor={colors.text.muted}
                    multiline
                    value={quoteText}
                    onChange={setQuoteText}
                    maxLength={500}
                    suggestionPosition="top"
                  />

                  {/* Audience — where this repost goes. Required, like create
                      post: nothing is pre-selected, and Repost/Post shows a
                      pill error until a destination is chosen. */}
                  {renderAudienceSection()}
                </>
              )}

              {canSubmitNewRepost ? (
                // The one job of this button: create a NEW repost — even when
                // the viewer already reposted (multiple reposts allowed, one
                // audience each). There is no edit-repost flow; changing or
                // removing a repost happens in the profile's Reposts tab.
                <TouchableOpacity
                  style={[sheetStyles.primaryBtn, { backgroundColor: colors.primary }]}
                  disabled={repostBusy}
                  onPress={() => doRepost(quoteText.trim() || undefined)}
                >
                  <Ionicons name="repeat" size={18} color="#fff" />
                  <Text style={sheetStyles.primaryBtnText}>
                    {repostBusy
                      ? "Reposting…"
                      : quoteText.trim()
                        ? "Post"
                        : "Repost"}
                  </Text>
                </TouchableOpacity>
              ) : (
                // Community (or author) disabled reposting — nothing to submit.
                // Show a notice instead of a dead-end Repost/Post button (the
                // icon itself stays visible so an existing repost's tick isn't
                // lost; the profile's Reposts tab handles management).
                <View
                  style={[
                    sheetStyles.disabledRepostNote,
                    { backgroundColor: colors.bg.surface, borderColor: colors.border },
                  ]}
                >
                  <Ionicons name="ban-outline" size={15} color={colors.text.muted} />
                  <Text style={[sheetStyles.disabledRepostNoteText, { color: colors.text.secondary }]}>
                    {typeof post.community === "object" && post.community
                      ? "Reposting is disabled for this community's posts"
                      : "The author has disabled reposting on their posts"}
                  </Text>
                </View>
              )}

              {/* The viewer already reposted this post somewhere — jump to
                  Search scoped to @me + @originalAuthor + the post's title to
                  see every repost they made of it. Only meaningful when a
                  repost exists, so it's gated on repostedByMe. */}
              {post.repostedByMe && (
                <TouchableOpacity
                  style={[
                    sheetStyles.secondaryBtn,
                    { backgroundColor: colors.bg.surface, borderColor: colors.border },
                  ]}
                  onPress={handleViewMyReposts}
                >
                  <Ionicons name="repeat" size={16} color={colors.primaryLight} />
                  <Text style={[sheetStyles.secondaryBtnText, { color: colors.primaryLight }]}>
                    View my reposts
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Post overflow menu — bottom sheet (Close poll / Delete / Report).
          Modal lifts it above the list so the sheet overlays the screen. */}
      {showMenu && (
        <Modal
          transparent
          visible
          animationType="fade"
          onRequestClose={() => setShowMenu(false)}
        >
          <PostMenuSheet
            visible
            onClose={() => setShowMenu(false)}
            options={menuOptions}
          />
        </Modal>
      )}

      {/* Action toast — transient confirmation (e.g. "Poll closed").
          pointerEvents="none" so it never blocks the feed underneath. */}
      {toastMsg != null && (
        <Modal transparent visible animationType="none" onRequestClose={() => {}}>
          <View style={styles.toastOverlay} pointerEvents="none">
            <Animated.View
              style={[
                styles.toastPill,
                {
                  opacity: toastOpacity,
                  backgroundColor: colors.bg.elevated,
                  borderColor: colors.border,
                },
              ]}
            >
              <Ionicons name="checkmark-circle" size={16} color={colors.primary} />
              <Text style={[styles.toastText, { color: colors.text.primary }]}>
                {toastMsg}
              </Text>
            </Animated.View>
          </View>
        </Modal>
      )}

    </View>
  );
}

// Module-level cache so a long feed of reposts doesn't re-fetch the same
// originals over and over. Entries expire after REPOST_CACHE_TTL_MS so a post
// deleted mid-session stops showing stale content within a couple of minutes
// (the original's author deleting it would otherwise keep it alive here).
const repostCache = new Map<string, { data: any; ts: number }>();
const REPOST_CACHE_TTL_MS = 2 * 60 * 1000;
// Hard cap so a very long session (or a feed of thousands of reposts) can't
// grow this module-level map forever — when exceeded, the oldest entries are
// dropped first.
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

// A repost can point at another repost (repost-of-repost). Walk the chain to
// the ROOT original so the preview shows real content/media. Bounded to avoid
// pathological chains. Returns null when the root is unreachable (deleted,
// 404, private) so callers render the "Original post is unavailable" state.
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
    } catch (e) {
      data = null;
    }
    // Cache BOTH hits and misses — a miss (deleted original) stays cached so
    // a long feed of reposts of the same deleted post doesn't hammer the API.
    cacheRepost(current, data);
    if (!data) return null;
    if (!data.repostOfId) return data;
    current = data.repostOfId;
  }
  const tail = repostCache.get(current);
  return tail?.data || null;
};

function RepostedPostCard({
  postId,
  wrapperId,
  isActive,
  onOpen,
  onOrigUnavailable,
  onTap,
}: {
  postId: string;
  wrapperId?: string;
  isActive?: boolean;
  onOpen?: (orig: any) => void;
  /** Fired when the original is unreachable (deleted/404) — the outer card
      hides its Repost action so unavailable content can't be reshared. */
  onOrigUnavailable?: () => void;
  /** Double-tap-aware tap router from the outer card: pass it the single-tap
      action (open the original) and it decides single-tap vs double-tap→like. */
  onTap?: (singleTap: () => void) => void;
}) {
  const colors = useThemeColors();
  const [orig, setOrig] = React.useState<any>(() => {
    // Prime from cache only when the cached value is a fresh resolved root.
    const cached = repostCache.get(postId);
    return cached && cached.data && !cached.data.repostOfId
      ? cached.data
      : undefined;
  });
  const [loaded, setLoaded] = React.useState(!!orig);
  const [mediaPage, setMediaPage] = React.useState(0);
  // Audio mute state mirrors the main card: shared module-level flag so
  // unmuting the preview unmutes every card, local state for the icon.
  const [isMuted, setIsMuted] = React.useState(globalIsMuted);
  React.useEffect(() => {
    setIsMuted(globalIsMuted);
  }, []);
  const toggleMute = () => {
    const newMuted = !globalIsMuted;
    globalIsMuted = newMuted;
    setIsMuted(newMuted);
  };

  // ── Poll state (the original may be a poll post) ────────────────────────
  const [pollData, setPollData] = React.useState<any>(null);
  const [myPollVote, setMyPollVote] = React.useState<number | null>(null);
  // Sync when the resolved original arrives (async) or the card is reused.
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
        if (!root) onOrigUnavailable?.();
      })
      .catch(() => {
        if (cancelled) return;
        setOrig(null);
        setLoaded(true);
        onOrigUnavailable?.();
      });
    return () => {
      cancelled = true;
    };
  }, [postId]);

  if (!loaded) return null;
  if (!orig)
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

  const author = orig.author || {};
  // Community badge for the preview header — mirrors the main card: when the
  // original lives in a community, show "• c/name" (with a lock for private
  // communities) next to the @username in the rolling identity line.
  const comm = (orig as any).community;
  const commName =
    typeof comm === "object" && comm
      ? comm.name || comm.slug
      : typeof comm === "string"
        ? comm
        : "";
  const media = (orig as any).media || [];
  const visual = media.filter(
    (m: any) => m.media_type !== "audio" && m.type !== "audio"
  );
  const origAudioMedia = media.filter(
    (m: any) => m.media_type === "audio" || m.type === "audio"
  );
  const origHasAudio = origAudioMedia.length > 0;
  const origLoc = (orig as any)?.location as
    | { lat: number; lon: number; place?: string }
    | null
    | undefined;
  const origHasVideo = visual.some(
    (m: any) => m.media_type === "video" || m.type === "video"
  );
  const previewW = CARD_W - spacing.md * 2;
  // Aspect-aware height from the first visual item; capped so tall images
  // don't blow up the card.
  let mediaH = 220;
  const first = visual[0];
  if (first?.width && first?.height) {
    const ratio = first.width / first.height;
    mediaH = Math.max(160, Math.min(previewW / ratio, 420));
  }

  const openOriginal = () => {
    if (orig?.id) onOpen?.(orig);
  };
  // Single tap opens the ORIGINAL's thread; a quick second tap is a double-tap
  // → like, routed through the outer card's shared detector. Without onTap the
  // preview's own touchable would swallow both taps and the like never fires.
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
      {/* Same author header as the outer card: avatar + name on top, then the
          @username → posted time → Original Audio meta rows stacked below and
          rolling one-by-one (RollingText) so the preview matches the main
          card's identity line. */}
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
            <Image
              source={{ uri: author.avatarUrl }}
              style={{ width: 26, height: 26 }}
            />
          ) : (
            <Text style={{ fontSize: 13 }}>👾</Text>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 12,
              fontWeight: "700",
              color: colors.text.primary,
            }}
            numberOfLines={1}
          >
            {author.name || author.username}
          </Text>
          <RollingText
            isActive={isActive}
            items={[
              <Text
                key="username"
                style={{
                  fontSize: 11,
                  color: colors.text.secondary,
                  fontWeight: "500",
                }}
              >
                @{author.username}
                {commName ? (
                  <Text style={{ color: colors.primaryLight, fontWeight: "700" }}>
                    {" "}• c/{commName}
                  </Text>
                ) : null}
              </Text>,
              <Text
                key="time"
                style={{
                  fontSize: 11,
                  color: colors.text.secondary,
                  fontWeight: "500",
                }}
              >
                {formatInstagramTime(
                  (orig as any).createdAt || (orig as any).publishedAt,
                )}
              </Text>,
              ...(origHasAudio
                ? [
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
                        color={colors.text.secondary}
                      />
                      <Text
                        style={{
                          color: colors.text.secondary,
                          fontSize: fontSizes.xs,
                          fontWeight: "500",
                        }}
                      >
                        Original Audio
                      </Text>
                    </View>,
                  ]
                : []),
              ...(origLoc
                ? [
                    <View
                      key="location"
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <Ionicons
                        name="location"
                        size={12}
                        color={colors.text.secondary}
                      />
                      <Text
                        style={{
                          color: colors.text.secondary,
                          fontSize: 11,
                          fontWeight: "500",
                        }}
                        numberOfLines={1}
                      >
                        {origLoc.place ||
                          `${origLoc.lat.toFixed(4)}, ${origLoc.lon.toFixed(4)}`}
                      </Text>
                    </View>,
                  ]
                : []),
            ]}
          />
        </View>
      </View>

      {/* Full original content (no truncation) */}
      {(orig as any).content || (orig as any).title ? (
        <Text
          style={{
            fontSize: fontSizes.md,
            color: colors.text.primary,
            lineHeight: 21,
          }}
        >
          {(orig as any).content || (orig as any).title}
        </Text>
      ) : null}

      {/* Original audio — invisible background player mirroring the main
          card, so audio-only originals actually play inside the embedded
          preview (and the audio track of video originals, whose visuals
          render muted above). Plays while the preview card is active. */}
      {origAudioMedia.length > 0 && (
        <View style={{ position: "absolute", opacity: 0, width: 0, height: 0 }}>
          {origAudioMedia.map((m: any, idx: number) => {
            const url = m.cloudfront_url || m.url || m.uri;
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

      {/* Full-width original media carousel — images + playable videos only.
          Audio is handled by the rolling stack; we never render an audio
          player or audio-only bar inside the embedded preview. */}
      {visual.length > 0 && (
        <View style={{ position: "relative" }}>
          {visual.length > 0 && (
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              snapToInterval={previewW}
              decelerationRate="fast"
              onScroll={(e) => {
                const x = e.nativeEvent.contentOffset.x;
                const page = Math.max(
                  0,
                  Math.min(visual.length - 1, Math.round(x / previewW)),
                );
                if (page !== mediaPage) setMediaPage(page);
              }}
              scrollEventThrottle={16}
            >
              {visual.map((m: any, idx: number) => {
                const url = m.cloudfront_url || m.url || m.uri;
                const isVid =
                  m.media_type === "video" || m.type === "video";
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
                      <FeedVideo
                        url={url}
                        width={previewW}
                        height={mediaH}
                        active={isActive ?? false}
                        loop
                        // Video sound stays off when the original carries its
                        // own audio track (that plays instead) — mirrors the
                        // main card's `isMuted || hasAudioTrack`.
                        muted={isMuted || origHasAudio}
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
          )}

          {/* Pagination dots */}
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

      {/* Poll of the original — display-only preview (question + options +
          vote bars, and the viewer's saved vote highlighted) BELOW the media.
          No onVote: the options are not tappable here, so taps fall through
          to the preview's own tap handler and open the ORIGINAL post, where
          voting happens. */}
      {pollData ? (
        <PollBlock poll={pollData} myVote={myPollVote} embedded />
      ) : null}

      {/* The ORIGINAL's engagement counts as a preview peek — pinned at the
          BOTTOM of the embedded preview. The repost card above carries its
          OWN counts; this row just shows what the original looks like.
          Tapping the preview opens the original's full thread. The mute /
          unmute speaker sits at the END of this row (right-aligned) so the
          audio control lives with the counts, not on top of the media. */}
      {((orig as any).likesCount ?? 0) + ((orig as any).commentsCount ?? 0) +
       ((orig as any).sharesCount ?? (orig as any).shares ?? 0) > 0 ||
        (isActive && (origHasAudio || origHasVideo)) ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
            <Ionicons name="heart-outline" size={13} color={colors.text.muted} />
            <Text style={{ fontSize: 11, color: colors.text.muted }}>
              {(orig as any).likesCount ?? 0}
            </Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
            <Ionicons
              name="chatbubble-outline"
              size={12}
              color={colors.text.muted}
            />
            <Text style={{ fontSize: 11, color: colors.text.muted }}>
              {(orig as any).commentsCount ?? 0}
            </Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
            <Ionicons name="repeat" size={12} color={colors.text.muted} />
            <Text style={{ fontSize: 11, color: colors.text.muted }}>
              {(orig as any).sharesCount ?? (orig as any).shares ?? 0}
            </Text>
          </View>

          <View style={{ flex: 1 }} />

          {/* Mute/unmute speaker — audio tracks AND video originals. Only
              shown while the preview is on screen (that's when sound plays). */}
          {isActive && (origHasAudio || origHasVideo) && (
            <TouchableOpacity
              style={{
                width: 24,
                height: 24,
                borderRadius: 12,
                backgroundColor: colors.bg.elevated,
                alignItems: "center",
                justifyContent: "center",
              }}
              onPress={toggleMute}
              activeOpacity={0.7}
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            >
              <Ionicons
                name={isMuted ? "volume-mute" : "volume-high"}
                size={13}
                color={colors.text.secondary}
              />
            </TouchableOpacity>
          )}
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

// ── Users modal: paginated list of users (likers / reposters) for a post,
// with Follow/Unfollow buttons synced to the backend state. Uses FlatList
// onEndReached for infinite scroll so huge lists stay smooth. fetchPage is
// the service call (getLikers / getReposters) that returns { data: rows }.
function UsersModal({
  visible,
  postId,
  title,
  emptyText,
  fetchPage,
  onClose,
}: {
  visible: boolean;
  postId: string;
  title: string;
  emptyText: string;
  fetchPage: (postId: string, page: number, limit: number, search?: string) => Promise<{ data: any[] }>;
  onClose: () => void;
}) {
  const colors = useThemeColors();
  const navigation = useNavigation<any>();
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce search query so we don't spam the backend
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const load = async (nextPage: number, refresh = false, searchStr = debouncedSearch) => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetchPage(postId, nextPage, 20, searchStr);
      const rows = res?.data || [];
      setHasMore(rows.length === 20);
      setUsers((prev) => (refresh ? rows : [...prev, ...rows]));
      setPage(nextPage);
    } catch (e) {
      console.warn("Failed to load likers", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  React.useEffect(() => {
    if (visible) {
      setUsers([]);
      setPage(1);
      setHasMore(false);
      load(1, true, debouncedSearch);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, postId, debouncedSearch]);

  // Optimistic toggle so Follow/Following flips instantly and stays synced
  // with every other surface. PRIVATE accounts create a follow REQUEST
  // server-side — the button shows "Request to Follow" / "Requested" and
  // tapping a pending request cancels it (same semantics as the profile
  // screen).
  const toggleFollow = async (user: any) => {
    const isPrivate = user.privacy === "private";
    const isRequest = isPrivate && !user.isFollowing && !user.followRequested;
    const cancelRequest = isPrivate && !user.isFollowing && user.followRequested;
    const next: any = { ...user };
    if (user.isFollowing) {
      next.isFollowing = false;
    } else if (cancelRequest) {
      next.followRequested = false;
    } else if (isRequest) {
      next.followRequested = true;
    } else {
      next.isFollowing = true;
    }
    setUsers((prev) =>
      prev.map((u) => (u.id === user.id ? next : u)),
    );
    try {
      if (user.isFollowing || cancelRequest) {
        await userService.unfollowUser(user.username);
      } else {
        await userService.followUser(user.username);
      }
    } catch (e) {
      console.warn("Follow toggle failed", e);
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? user : u)),
      );
    }
  };

  // Follow button label — public accounts toggle Follow/Following; private
  // accounts toggle Request to Follow / Requested (and stay "Requested"
  // until the owner approves).
  const followLabel = (user: any) => {
    if (user.isFollowing) return "Following";
    if (user.privacy === "private") {
      return user.followRequested ? "Requested" : "Request to Follow";
    }
    return "Follow";
  };

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'height' : undefined} style={{ flex: 1 }}>
        <View style={sheetStyles.likersBackdrop}>
          <TouchableWithoutFeedback onPress={onClose}>
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>
        <View
          style={[
            sheetStyles.likersSheet,
            { backgroundColor: colors.bg.card, borderColor: colors.border },
          ]}
        >
          <View style={sheetStyles.likersHeader}>
            <Text style={[sheetStyles.likersTitle, { color: colors.text.primary }]}>
              {title}
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={22} color={colors.text.secondary} />
            </TouchableOpacity>
          </View>

          {/* Search bar */}
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bg.elevated, borderRadius: 12, paddingHorizontal: 12, marginBottom: 12, marginHorizontal: 16 }}>
            <Ionicons name="search" size={18} color={colors.text.muted} />
            <TextInput
              style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 8, color: colors.text.primary, fontSize: 14 }}
              placeholder={`Search ${title.toLowerCase()}...`}
              placeholderTextColor={colors.text.muted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={18} color={colors.text.muted} />
              </TouchableOpacity>
            )}
          </View>

          <FlatList
            data={users}
            keyExtractor={(item, index) => item.id || String(index)}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load(1, true, debouncedSearch);
            }}
            onEndReached={() => {
              if (hasMore && !loading) load(page + 1);
            }}
            onEndReachedThreshold={0.4}
            ListEmptyComponent={
              <Text style={[sheetStyles.likersEmpty, { color: colors.text.muted }]}>
                {loading ? "Loading..." : emptyText}
              </Text>
            }
            ListFooterComponent={
              loading && users.length > 0 ? (
                <ActivityIndicator
                  size="small"
                  color={colors.primary}
                  style={{ paddingVertical: 14 }}
                />
              ) : null
            }
            renderItem={({ item }) => (
              <View style={sheetStyles.likersRow}>
                <TouchableOpacity
                  style={sheetStyles.likersUserInfo}
                  onPress={() => {
                    onClose();
                    if (currentUser?.id && item.id === currentUser.id) {
                      navigation.navigate("Profile");
                    } else {
                      navigation.push("UserProfile", {
                        user: {
                          id: item.id,
                          name: item.name,
                          username: item.username,
                          handle: item.username,
                          avatar: "",
                          avatarUrl: item.avatarUrl,
                          level: 1,
                          xp: 0,
                          xpToNext: 100,
                        },
                      });
                    }
                  }}
                >
                  <View style={{ position: "relative" }}>
                    <View style={sheetStyles.likersAvatar}>
                      {item.avatarUrl ? (
                        <Image
                          source={{ uri: item.avatarUrl }}
                          style={{ width: "100%", height: "100%", borderRadius: 18 }}
                        />
                      ) : (
                        <Text style={{ fontSize: 18 }}>👾</Text>
                      )}
                    </View>
                    <ActiveStatusDot userId={item.id} size={11} style={{ bottom: 0, right: 0 }} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{ fontSize: fontSizes.sm, fontWeight: "700", color: colors.text.primary }}
                      numberOfLines={1}
                    >
                      {item.name}
                    </Text>
                    <Text style={{ fontSize: fontSizes.xs, color: colors.text.muted }} numberOfLines={1}>
                      @{item.username}
                    </Text>
                  </View>
                </TouchableOpacity>
                {currentUser?.id && item.id !== currentUser.id && (
                  <TouchableOpacity
                    onPress={() => toggleFollow(item)}
                    style={[
                      sheetStyles.likersFollowBtn,
                      (item.isFollowing || item.followRequested) && {
                        backgroundColor: colors.bg.elevated,
                        borderWidth: 1,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        sheetStyles.likersFollowText,
                        (item.isFollowing || item.followRequested) && {
                          color: colors.text.secondary,
                        },
                      ]}
                    >
                      {followLabel(item)}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          />
        </View>
      </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const sheetStyles = StyleSheet.create({
  likersBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  likersSheet: {
    height: "72%",
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: 24,
  },
  likersHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  likersTitle: {
    fontSize: fontSizes.lg,
    fontWeight: "800",
  },
  likersEmpty: {
    textAlign: "center",
    paddingVertical: 28,
    fontSize: fontSizes.sm,
  },
  likersRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
  },
  likersUserInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  likersAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(124,58,237,0.12)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  likersFollowBtn: {
    backgroundColor: "#7C3AED",
    borderRadius: radii.full,
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  likersFollowText: {
    color: "#fff",
    fontSize: fontSizes.sm,
    fontWeight: "700",
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: 32,
    // The expandable audience list can make the sheet tall — never let it run
    // off a small screen.
    maxHeight: "90%",
  },
  sheetTitle: {
    fontSize: fontSizes.sm,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 13,
  },
  optionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  optionLabel: { fontSize: fontSizes.md, fontWeight: "700" },
  optionSub: { fontSize: fontSizes.xs, marginTop: 1 },
  cancel: { fontSize: fontSizes.md, fontWeight: "700", textAlign: "center", flex: 1, paddingVertical: 10 },

  // ── Revamped repost sheet ──────────────────────────────────────
  dragHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    marginTop: 6,
    marginBottom: 10,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  sheetHeaderTitle: { fontSize: fontSizes.lg, fontWeight: "800" },
  sheetClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  repostErrorPop: {
    marginTop: 8,
    alignSelf: "flex-start",
    minWidth: 150,
    backgroundColor: "rgba(239,68,68,0.95)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#EF4444",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 12,
    zIndex: 300,
  },
  repostErrorPopText: {
    fontSize: fontSizes.xs,
    fontWeight: "700",
    color: "#fff",
    flexShrink: 1,
  },
  audienceLabel: {
    fontSize: fontSizes.xs,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderRadius: radii.full,
    marginTop: 4,
  },
  primaryBtnText: { color: "#fff", fontSize: fontSizes.md, fontWeight: "800" },
  // Replaces the Repost/Post submit when the community or author disabled
  // reposting and the viewer has no existing repost to remove.
  disabledRepostNote: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingVertical: 13,
    borderRadius: radii.full,
    borderWidth: 1,
    marginTop: 4,
  },
  disabledRepostNoteText: { fontSize: fontSizes.sm, fontWeight: "600" },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: radii.full,
    borderWidth: 1,
    marginTop: 10,
  },
  secondaryBtnText: { fontSize: fontSizes.md, fontWeight: "700" },
  audienceChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: "transparent",
    backgroundColor: "rgba(124,58,237,0.08)",
    maxWidth: 170,
  },
  audienceChipActive: {
    borderColor: "rgba(124,58,237,0.45)",
    backgroundColor: "rgba(124,58,237,0.15)",
  },
  audienceChipText: {
    fontSize: fontSizes.xs,
    fontWeight: "600",
    flexShrink: 1,
  },
  composerInputWrap: {
    minHeight: 90,
    maxHeight: 160,
    // Visible text box — a bare input with no border/background reads as
    // "there is no input box", so give it a real field surface.
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.35)',
    borderRadius: radii.lg,
    padding: spacing.sm,
    // NOTE: no overflow hidden — the mention/hashtag suggestion popover is
    // absolutely positioned above the box and must not be clipped.
  },
  composerInput: {
    minHeight: 90,
    maxHeight: 160,
    fontSize: fontSizes.md,
    textAlignVertical: "top",
    paddingVertical: 0,
    margin: 0,
  },
});
