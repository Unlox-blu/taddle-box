import React, {
  useMemo,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  FlatList,
  Image,
  TextInput,
  DeviceEventEmitter,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Share,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { fontSizes, spacing, radii, type ColorPalette } from "../../theme";
import { useThemeColors, useTheme } from "../../context/ThemeContext";
import { userService } from "../../services/user.service";
import { useAuth } from "../../context/AuthContext";
import XPProgressBar from "../home/XPProgressBar";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { WebView } from "react-native-webview";
import SharedFeed, { type FeedRow } from "../common/SharedFeed";
import PullToRefreshWrapper from "../common/PullToRefreshWrapper";
import StateBlock from "../common/StateBlock";
import { useGlobalScroll } from "../../context/ScrollContext";
import { postsService } from "../../services/posts.service";
import { activeStatusIndicator } from "../../context/ActiveStatusContext";
import CommentsModal from "../home/CommentsModal";
import ActiveStatusDot from "../common/ActiveStatusDot";
import { notificationService } from "../../services/notification.service";
import { accountSocket } from "../../services/accountSocketClient";
import type { XPUpdatedPayload } from "../../types";
import { themedAlert } from "../common/ThemedAlert";
import BioText, { normalizeUrl } from "../common/BioText";
import BrandedLottieLoader from "../common/BrandedLoader";
import { log, warn } from '../../utils/logger';

const { width } = Dimensions.get("window");

const BADGE_COLORS: Record<string, { bg: string; border: string }> = {
  gold: { bg: "rgba(251,191,36,0.13)", border: "rgba(251,191,36,0.28)" },
  purple: { bg: "rgba(124,58,237,0.13)", border: "rgba(124,58,237,0.28)" },
  cyan: { bg: "rgba(6,182,212,0.13)", border: "rgba(6,182,212,0.28)" },
  green: { bg: "rgba(16,185,129,0.13)", border: "rgba(16,185,129,0.28)" },
};

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg.base },
    bannerWrap: {
      width: "100%",
      height: 180,
      backgroundColor: c.bg.elevated,
      position: "relative",
      overflow: "hidden",
    },
    bannerImage: { width: "100%", height: "100%" },
    bannerShade: {
      position: "absolute",
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
    },
    // Melts the banner into the page background. Tall + dark-at-top so the
    // overlapping avatar/name sit on a soft scrim that becomes the exact page
    // color at the banner's bottom edge — no hard seam, and the name stays
    // readable even over a busy banner photo.
    bannerFade: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      height: 150,
    },
    bannerEditBtn: {
      position: "absolute",
      top: 12,
      right: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      backgroundColor: "rgba(0,0,0,0.45)",
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: radii.full,
    },
    bannerEditText: {
      fontSize: fontSizes.xs,
      fontWeight: "700",
      color: "#fff",
    },
    heroGrad: { paddingBottom: 4 },
    // NO solid background — the row floats over the banner's fade gradient so
    // the avatar and identity block visually melt into the cover instead of
    // sitting on a hard-edged solid slab (the fade's dark scrim keeps the name
    // legible; the fade ends exactly at the page background color).
    profileRow: {
      flexDirection: "row",
      gap: 16,
      alignItems: "flex-end",
      marginTop: -48,
      paddingHorizontal: spacing.xl,
      paddingBottom: 14,
    },
    mutualAvatars: { flexDirection: "row", alignItems: "center" },
    mutualAvatar: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 1.5,
      borderColor: c.bg.base,
      backgroundColor: c.bg.elevated,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    mutualAvatarImg: { width: "100%", height: "100%" },
    mutualAvatarText: { fontSize: 9, fontWeight: "800", color: c.text.muted },
    avatarWrap: { position: "relative" },
    avatar: {
      width: 92,
      height: 92,
      borderRadius: 46,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 4,
      borderColor: c.bg.base,
      overflow: "hidden",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 6,
      elevation: 4,
    },
    avatarImage: { width: "100%", height: "100%" },
    avatarEmoji: { fontSize: 36 },
    levelBadge: {
      position: "absolute",
      bottom: -2,
      right: -2,
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 3,
      borderColor: c.bg.base,
    },
    levelText: { fontSize: fontSizes.xs, fontWeight: "800", color: "#1A0A00" },
    profileInfo: { flex: 1, paddingBottom: 2 },
    name: {
      fontSize: fontSizes.xxl,
      fontWeight: "800",
      color: c.text.primary,
      marginBottom: 2,
    },
    handleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginBottom: 6,
    },
    handleRank: {
      fontSize: fontSizes.sm,
      color: c.text.muted,
      fontWeight: "600",
    },
    bio: { fontSize: fontSizes.sm, color: c.text.secondary, lineHeight: 20 },
    bioSection: {
      paddingHorizontal: spacing.xl,
      paddingTop: 10,
      paddingBottom: 4,
    },
    locationRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      marginTop: 8,
    },
    locationText: {
      fontSize: fontSizes.sm,
      color: c.text.muted,
      fontWeight: "500",
      flexShrink: 1,
    },
    linkRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      marginTop: 8,
    },
    linkText: {
      fontSize: fontSizes.sm,
      fontWeight: "700",
      color: c.primaryLight,
      flexShrink: 1,
    },
    mutualRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      marginTop: 8,
    },
    mutualText: {
      fontSize: fontSizes.xs,
      color: c.text.secondary,
      lineHeight: 16,
    },
    mutualName: {
      fontWeight: "700",
      color: c.text.primary,
    },

    requestsBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      marginHorizontal: spacing.lg,
      marginTop: spacing.md,
      padding: spacing.md,
      borderRadius: radii.lg,
      borderWidth: 1,
    },
    requestsBannerIcon: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(124,58,237,0.18)",
    },
    requestsBannerTitle: { fontSize: fontSizes.md, fontWeight: "700" },
    requestsBannerSub: { fontSize: fontSizes.xs, marginTop: 2 },

    lockCircle: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: c.bg.card,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: "center",
      justifyContent: "center",
    },
    lockTitle: { fontSize: fontSizes.lg, fontWeight: "800" },
    lockSub: { fontSize: fontSizes.sm, textAlign: "center", lineHeight: 20 },

    statsRow: {
      flexDirection: "row",
      paddingHorizontal: spacing.xl,
      paddingVertical: 14,
      borderTopWidth: 1,
      borderTopColor: c.border,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    statItem: { flex: 1, alignItems: "center" },
    statVal: {
      fontSize: fontSizes.lg,
      fontWeight: "800",
      color: c.text.primary,
    },
    statLabel: { fontSize: fontSizes.xs, color: c.text.muted, marginTop: 2 },

    btnRow: {
      flexDirection: "row",
      gap: 10,
      alignItems: "center",
      paddingHorizontal: spacing.xl,
      paddingVertical: 12,
    },
    primaryBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.primary,
      borderRadius: radii.md,
      paddingVertical: 10,
    },
    primaryBtnActive: {
      backgroundColor: "transparent",
      borderWidth: 1,
      borderColor: c.borderHover,
    },
    primaryBtnText: {
      fontSize: fontSizes.sm,
      fontWeight: "700",
      color: "#fff",
    },
    primaryBtnTextActive: { color: c.text.primary },

    editBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      borderWidth: 1,
      borderColor: c.borderHover,
      borderRadius: radii.md,
      paddingVertical: 9,
    },
    editBtnText: {
      fontSize: fontSizes.sm,
      fontWeight: "600",
      color: c.text.primary,
    },

    shareBtn: {
      width: 40,
      height: 40,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: c.borderHover,
      alignItems: "center",
      justifyContent: "center",
    },

    sectionLabel: {
      fontSize: fontSizes.xs,
      fontWeight: "700",
      color: c.text.muted,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      paddingHorizontal: spacing.xl,
      marginBottom: 10,
      marginTop: 4,
    },
    postTabs: {
      flexDirection: "row",
      marginHorizontal: spacing.xl,
      marginTop: 6,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    postTab: {
      flex: 1,
      alignItems: "center",
      paddingVertical: 10,
      position: "relative",
    },
    postTabText: {
      fontSize: fontSizes.md,
      fontWeight: "700",
      color: c.text.muted,
    },
    postTabTextActive: {
      color: c.primaryLight,
    },
    postTabActiveBar: {
      position: "absolute",
      bottom: -1,
      left: 0,
      right: 0,
      height: 2.5,
      borderTopLeftRadius: radii.full,
      borderTopRightRadius: radii.full,
      backgroundColor: c.primaryLight,
    },
    // Mentions tab rows — notifications-style (avatar, actor, message, time,
    // content thumbnail), tapping opens the mentioned post.
    mentionRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: spacing.lg,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
      backgroundColor: c.bg.base,
    },
    mentionAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.bg.elevated,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    mentionBody: { flex: 1, gap: 2 },
    mentionName: {
      fontSize: fontSizes.sm,
      fontWeight: "800",
      color: c.text.primary,
    },
    mentionText: {
      fontSize: fontSizes.xs,
      color: c.text.secondary,
      lineHeight: 17,
    },
    mentionTime: { fontSize: fontSizes.xs, color: c.text.muted, marginTop: 2 },
    mentionThumb: {
      width: 44,
      height: 44,
      borderRadius: 10,
      backgroundColor: c.bg.elevated,
    },
    achievementsCard: {
      marginHorizontal: spacing.lg,
      marginTop: spacing.md,
      marginBottom: spacing.md,
      backgroundColor: c.bg.card,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: c.border,
      paddingTop: spacing.sm,
      paddingBottom: spacing.md,
      overflow: "hidden",
    },

    badgeScroll: {
      paddingHorizontal: spacing.xl,
      gap: 12,
      marginBottom: spacing.md,
    },
    badgeItem: { alignItems: "center", gap: 5 },
    badgeWrap: {
      width: 52,
      height: 52,
      borderRadius: radii.md,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    badgeEmoji: { fontSize: 24 },
    badgeName: {
      fontSize: 9,
      color: c.text.muted,
      textAlign: "center",
      maxWidth: 52,
    },

    modalContainer: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "flex-end",
    },
    modalContent: {
      backgroundColor: c.bg.card,
      borderTopLeftRadius: radii.xl,
      borderTopRightRadius: radii.xl,
      padding: spacing.lg,
      maxHeight: "80%",
    },
    modalHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: spacing.lg,
    },
    modalTitle: {
      fontSize: fontSizes.lg,
      fontWeight: "800",
      color: c.text.primary,
    },
    userRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    userInfo: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
    userAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.bg.elevated,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    userName: {
      fontSize: fontSizes.md,
      fontWeight: "700",
      color: c.text.primary,
    },
    userHandle: { fontSize: fontSizes.xs, color: c.text.secondary },
    unfollowBtn: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: c.borderHover,
    },
    unfollowBtnText: {
      fontSize: fontSizes.xs,
      fontWeight: "600",
      color: c.text.primary,
    },
  });
}

interface SharedProfileProps {
  initialUser: any;
  isOwnProfile: boolean;
  onRefresh?: () => void;
  headerComponent?: React.ReactNode;
  /** Post id to auto-open (comments) once the profile + posts load — used for
   *  notification deep links that land on the post inside the profile page. */
  openPostId?: string;
  /** Full post shipped with the navigation — opens the comments immediately
   *  without waiting on the profile's own posts fetch. */
  openPost?: any;
}

export default function SharedProfile({
  initialUser,
  isOwnProfile,
  headerComponent,
  openPostId,
  openPost,
}: SharedProfileProps) {
  const { isDark } = useTheme();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const navigation = useNavigation<any>();
  const { headerHeight } = useGlobalScroll();

  const [user, setUser] = useState<any>(initialUser);
  const [followed, setFollowed] = useState(!!initialUser?.isFollowing);
  const [followStatus, setFollowStatus] = useState<string | null>(
    initialUser?.followStatus || null,
  );
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [qrModalVisible, setQrModalVisible] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);

  const [showFollowList, setShowFollowList] = useState(false);
  const [followListType, setFollowListType] = useState<
    "followers" | "following" | "mutuals"
  >("followers");
  // In-app browser — profile/bio links open here instead of the system browser.
  const [browserUrl, setBrowserUrl] = useState<string | null>(null);

  const { user: currentUser } = useAuth();
  const [posts, setPosts] = useState<FeedRow[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  // Profile feed filter: "Posts" (originals), "Reposts" (Twitter-style), and
  // "Mentions" — @-mentions of this user, rendered like the notifications UI
  // (own profile only: someone else's mentions are private).
  const [profileTab, setProfileTab] = useState<
    "posts" | "reposts" | "mentions"
  >("posts");
  // Guards against out-of-order responses when switching tabs fast — only the
  // latest request may commit its posts.
  const postsReqRef = useRef(0);
  const [mentions, setMentions] = useState<any[]>([]);
  const [loadingMentions, setLoadingMentions] = useState(false);
  const [mentionPage, setMentionPage] = useState(1);
  const [hasMoreMentions, setHasMoreMentions] = useState(false);
  const [loadingMoreMentions, setLoadingMoreMentions] = useState(false);
  const mentionsReqRef = useRef(0);
  // The Mentions list is conditionally rendered (unmounts when switching to
  // the posts/reposts tabs) and the posts list remounts when coming back from
  // Mentions — so the scroll offset is captured here from whichever list is
  // active and restored on the freshly mounted list, keeping the profile
  // header + tab bar in place instead of snapping to the top on tab switch.
  const mentionsListRef = useRef<any>(null);
  const profileScrollOffset = useRef(0);
  // Deep-link: a notification tapped through to a post inside this profile.
  const [openCommentPost, setOpenCommentPost] = useState<any>(null);
  const [openCommentVisible, setOpenCommentVisible] = useState(false);
  const openPostHandledRef = useRef<string | null>(null);

  const handleDeletePost = async (post: any) => {
    themedAlert("Delete Post", "Are you sure you want to delete this post?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await postsService.deletePost(post.id);
            setPosts((prev) => prev.filter((p: any) => p.id !== post.id));
          } catch (e) {
            warn("Failed to delete post", e);
          }
        },
      },
    ]);
  };

  // Mention row tap — post & comment mentions both carry the post id; open the
  // full post page (same redirect as the notifications screen). Falls back to
  // the sender's profile when the post is gone (deleted / private / legacy).
  const openMention = useCallback(
    async (notif: any) => {
      const resourceId = notif?.resourceId;
      if (resourceId) {
        try {
          const res = await postsService.getPost(resourceId);
          const post = res?.data;
          if (post) {
            // Comment mentions carry the exact comment id → the post page
            // auto-scrolls to and highlights that comment.
            (navigation as any).push("PostDetail", {
              post,
              commentId: notif?.payload?.commentId,
            } as any);
            return;
          }
        } catch (e) {
          // fall through to the sender's profile
        }
      }
      const username = notif?.payload?.username;
      if (username) {
        (navigation as any).push("UserProfile", {
          user: {
            name: notif.actor,
            username,
            avatarUrl: notif.avatarUrl,
            handle: username,
            avatar: "👾",
            level: 1,
            xp: 0,
            xpToNext: 100,
          } as any,
        });
      }
    },
    [navigation],
  );

  const renderMentionRow = (notif: any) => (
    <TouchableOpacity
      key={String(notif?.id)}
      style={styles.mentionRow}
      activeOpacity={0.7}
      onPress={() => openMention(notif)}
    >
      <View style={styles.mentionAvatar}>
        {notif?.avatarUrl ? (
          <Image
            source={{ uri: notif.avatarUrl }}
            style={{ width: "100%", height: "100%" }}
          />
        ) : (
          <Text style={{ fontSize: 15 }}>{notif?.avatar || "👤"}</Text>
        )}
      </View>
      <View style={styles.mentionBody}>
        <Text style={styles.mentionName} numberOfLines={1}>
          {notif?.actor || "Someone"}
        </Text>
        <Text style={styles.mentionText} numberOfLines={2}>
          {notif?.text || "mentioned you"}
        </Text>
        <Text style={styles.mentionTime}>{notif?.time || ""}</Text>
      </View>
      {notif?.thumbnailUrl ? (
        <Image
          source={{ uri: notif.thumbnailUrl }}
          style={styles.mentionThumb}
          resizeMode="cover"
        />
      ) : null}
    </TouchableOpacity>
  );

  const loadProfile = useCallback(async () => {
    const username = initialUser?.username || "";
    if (!username) return;
    try {
      const profileRes = await userService.getProfile(username);
      if (profileRes?.data) {
        setUser(profileRes.data);
        setFollowed(!!profileRes.data.isFollowing);
        setFollowStatus(profileRes.data.followStatus || null);

        // Check if this profile is bookmarked by the current user
        try {
          const bookmarkRes = await postsService.checkBookmark('profile', profileRes.data.id);
          setIsBookmarked(!!bookmarkRes?.data?.bookmarked);
        } catch (err) {
          // Ignore bookmark check failures
        }
      }
    } catch (e) {
      warn("Failed to load profile", e);
    } finally {
      setLoadingProfile(false);
    }
  }, [initialUser?.username]);

  const loadPosts = useCallback(async () => {
    // The Mentions tab has its own loader + list — never fetch posts for it.
    if (profileTab === "mentions") {
      setPosts([]);
      setLoadingPosts(false);
      return;
    }
    const reqId = ++postsReqRef.current;
    try {
      if (!user?.id) return;
      // Private accounts: don't even ask the API for posts the viewer can't see.
      if (!isOwnProfile && user?.privacy === "private" && !followed) {
        setPosts([]);
        setLoadingPosts(false);
        return;
      }
      setLoadingPosts(true);
      const postsRes = await postsService.getUserPosts(
        user.id,
        1,
        20,
        profileTab,
      );
      // A newer request (e.g. tab switch) started after this one — drop this.
      if (postsReqRef.current !== reqId) return;
      if (postsRes?.data) {
        setPosts(postsRes.data);
      }
    } catch (e) {
      warn("Failed to load user posts", e);
    } finally {
      if (postsReqRef.current === reqId) setLoadingPosts(false);
    }
  }, [user?.id, user?.privacy, followed, isOwnProfile, profileTab]);

  // Mentions — the user's @-mention notifications (post + comment mentions),
  // server-filtered by type, paginated like the notifications screen.
  const loadMentions = useCallback(
    async (page = 1, append = false) => {
      const reqId = ++mentionsReqRef.current;
      try {
        if (!user?.id) return;
        if (!append) setLoadingMentions(true);
        const res = await notificationService.getNotifications(
          page,
          20,
          false,
          "MENTION",
        );
        if (mentionsReqRef.current !== reqId) return;
        const rows = res.data || [];
        const meta = res.meta as any;
        setHasMoreMentions(meta ? !!meta.hasNext : rows.length === 20);
        setMentions((prev) =>
          append
            ? [
                ...prev,
                ...rows.filter(
                  (r: any) => !prev.some((p: any) => p.id === r.id),
                ),
              ]
            : rows,
        );
        setMentionPage(page);
      } catch (e) {
        warn("Failed to load mentions", e);
      } finally {
        if (mentionsReqRef.current === reqId) setLoadingMentions(false);
      }
    },
    [user?.id],
  );

  useEffect(() => {
    if (!user?.id) return;
    if (profileTab === "mentions") loadMentions();
    else loadPosts();
  }, [
    user?.id,
    user?.privacy,
    followed,
    isOwnProfile,
    loadPosts,
    loadMentions,
    profileTab,
  ]);

  // Refetch profile + posts whenever the screen regains focus so follower/post/
  // XP counts stay fresh (e.g. new followers or posts while away) without a
  // manual pull-to-refresh.
  useFocusEffect(
    useCallback(() => {
      loadProfile();
      if (!user?.id) return;
      if (profileTab === "mentions") loadMentions();
      else loadPosts();
    }, [loadProfile, loadPosts, loadMentions, profileTab, user?.id]),
  );

  // Live XP on the profile header: the backend emits xp:updated (balance +
  // cumulative earned) on every credit/debit, so the XP progress bar, level,
  // and rank update in real time after games, claims, and streak actions — no
  // pull-to-refresh needed. Gated to the account owner: the event is pushed
  // to the viewer's own socket room, so without the gate, viewing someone
  // else's profile while earning XP would overwrite THEIR numbers with the
  // viewer's.
  useEffect(() => {
    if (!isOwnProfile) return;
    const handleXPUpdated = (data: XPUpdatedPayload) => {
      setUser((prev: any) => {
        if (!prev) return prev;
        const totalXpEarned =
          data?.totalXpEarned != null
            ? Number(data.totalXpEarned)
            : (prev.totalXpEarned ?? prev.xp ?? 0);
        // Same formula the backend getProfile uses for level/rank/xpToNext.
        const level = Math.floor(totalXpEarned / 1000) + 1;
        return {
          ...prev,
          xp: data?.xp != null ? Number(data.xp) : prev.xp,
          totalXpEarned,
          level,
          rank: level > 10 ? "Pro" : level > 5 ? "Intermediate" : "Beginner",
          xpToNext: level * 1000,
        };
      });
    };
    accountSocket.events.on("xp:updated", handleXPUpdated);
    return () => accountSocket.events.off("xp:updated", handleXPUpdated);
  }, [isOwnProfile]);

  // Re-entering the Mentions tab remounts its FlatList — restore the offset
  // captured from the previous tab (posts/reposts) so the header and tab bar
  // stay exactly where they were instead of snapping to the top.
  useEffect(() => {
    if (profileTab !== "mentions" || loadingMentions || mentions.length === 0)
      return;
    const t = setTimeout(() => {
      mentionsListRef.current?.scrollToOffset({
        offset: profileScrollOffset.current,
        animated: false,
      });
    }, 30);
    return () => clearTimeout(t);
  }, [profileTab, loadingMentions, mentions.length]);

  // Private accounts hide their posts until the viewer is an approved follower.
  const isLocked = !isOwnProfile && user?.privacy === "private" && !followed;

  // Notification deep links: open the post's comments right inside this page.
  // A full post shipped via `openPost` opens instantly; otherwise wait until
  // the profile's posts load (or fetch the post by id) and open it then.
  // Private accounts the viewer can't access are skipped entirely — fetching
  // the post would only 403 (a useless request), so we never fire it.
  useEffect(() => {
    const key = openPost?.id || openPostId;
    if (!key || openPostHandledRef.current === key) return;
    // A shipped `openPost` was already fetched successfully (the backend only
    // lets viewers who can see the post fetch it), so open it instantly — no
    // need to wait on the profile or re-check privacy.
    if (openPost) {
      openPostHandledRef.current = key;
      setOpenCommentPost(openPost);
      setOpenCommentVisible(true);
      return;
    }
    // Otherwise wait for the profile fetch so privacy/follow state is known
    // before deciding whether the deep-linked post is even viewable
    // (initialUser from navigation doesn't carry `privacy`).
    if (loadingProfile) return;
    // Locked private account → skip: no post fetch, no comments modal.
    if (isLocked) {
      openPostHandledRef.current = key;
      return;
    }
    if (!user?.id) return;
    openPostHandledRef.current = key;
    const target = posts.find((p: any) => String(p.id) === String(key));
    if (target) {
      setOpenCommentPost(target);
      setOpenCommentVisible(true);
    } else {
      postsService
        .getPost(key)
        .then((res) => {
          if (res?.data) {
            setOpenCommentPost(res.data);
            setOpenCommentVisible(true);
          }
        })
        .catch(() => {});
    }
  }, [openPost, openPostId, user?.id, posts, isLocked, loadingProfile]);

  const handleFollowToggle = async () => {
    try {
      if (followed) {
        await userService.unfollowUser(user.username);
        setFollowed(false);
        setUser((prev: any) => ({
          ...prev,
          followerCount: Math.max((prev.followerCount || 0) - 1, 0),
        }));
      } else if (followStatus === "pending") {
        await userService.unfollowUser(user.username);
        setFollowStatus(null);
      } else {
        await userService.followUser(user.username);
        if (user?.privacy === "private") {
          // Private account → a follow request is created, not an active follow.
          setFollowStatus("pending");
        } else {
          setFollowed(true);
          setUser((prev: any) => ({
            ...prev,
            followerCount: (prev.followerCount || 0) + 1,
          }));
        }
      }
    } catch (e) {
      warn("Failed to toggle follow", e);
    }
  };

  const handleBookmarkToggle = async () => {
    if (!user?.id) return;
    const previous = isBookmarked;
    setIsBookmarked(!previous);
    try {
      await postsService.toggleBookmark('profile', user.id);
    } catch (e) {
      setIsBookmarked(previous);
      warn("Failed to toggle bookmark", e);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadProfile();
      if (!user?.id) return;
      if (profileTab === "mentions") {
        await loadMentions();
      } else if (!(!isOwnProfile && user?.privacy === "private" && !followed)) {
        const postsRes = await postsService.getUserPosts(
          user.id,
          1,
          20,
          profileTab,
        );
        if (postsRes?.data) setPosts(postsRes.data);
      }
    } catch (e) {
      warn("Failed to refresh profile", e);
    } finally {
      setRefreshing(false);
    }
  }, [loadProfile, loadMentions, user?.id, isOwnProfile, followed, profileTab]);

  const refreshProps = { refreshing, onRefresh };

  // Tab-bar double-tap on Profile → scroll to top + refresh (Home-style).
  // Scroll-to-top for the posts feed is handled inside SharedFeed; the
  // mentions list scrolls via its own ref here.
  useEffect(() => {
    const subs = [
      DeviceEventEmitter.addListener("profileSingleTap", () => {
        mentionsListRef.current?.scrollToOffset({ offset: 0, animated: true });
      }),
      DeviceEventEmitter.addListener("profileDoubleTap", () => {
        mentionsListRef.current?.scrollToOffset({ offset: 0, animated: true });
        DeviceEventEmitter.emit("triggerPullRefresh");
        setTimeout(() => onRefresh(), 500);
      }),
    ];
    return () => subs.forEach((s) => s.remove());
  }, [onRefresh]);

  const openFollowList = (type: "followers" | "following") => {
    // Private account + not an approved follower: counts stay visible but the
    // list itself is gated (same rule the backend enforces with a 403).
    if (isLocked) {
      themedAlert(
        "Private Account",
        `Follow @${user?.username || "user"} to see their ${type === "followers" ? "followers" : "following"}.`,
      );
      return;
    }
    setFollowListType(type);
    setShowFollowList(true);
  };

  // Instagram-style "Followed by x, y and N others" — backend computes the
  // mutuals for the logged-in viewer; mutuals are GLOBAL (shown even on
  // private accounts without a follow request). Hidden on the viewer's OWN
  // profile: "Followed by" makes no sense when the viewer IS the account.
  const mutualUsers = isOwnProfile
    ? []
    : (user?.mutuals?.users || []).slice(0, 2);
  const mutualCount = isOwnProfile
    ? 0
    : user?.mutuals?.count || mutualUsers.length;

  // The cover banner sits below the absolute MainHeader (which hides over the
  // content on scroll — Instagram style). Each scrollable below adds its own
  // contentContainerStyle paddingTop so the offset scrolls away with the page
  // and the banner fills the screen once the header is gone. NOTE: the posts
  // tab uses SharedFeed, which already adds the offset — double-padding here
  // would create a gap under the header.
  // Posts / Reposts / Mentions — segmented tab bar (Twitter-style underline).
  // Lives at the BOTTOM of the scrolling profile header, right below the
  // achievements card — so the tabs appear under the banner/avatar/bio/stats/
  // achievements, NOT pinned under the main header. The pinned-section-chrome
  // treatment was reverted for the profile: on-device the tabs sat at the top
  // (above the achievements), which looked wrong. Hidden on locked private
  // accounts along with the feed. Mentions is own-profile only.
  const profileTabs = !isLocked ? (
    <View style={styles.postTabs}>
      {(isOwnProfile
        ? (["posts", "reposts", "mentions"] as const)
        : (["posts", "reposts"] as const)
      ).map((tab) => (
        <TouchableOpacity
          key={tab}
          style={styles.postTab}
          activeOpacity={0.7}
          onPress={() => setProfileTab(tab)}
        >
          <Text
            style={[
              styles.postTabText,
              profileTab === tab && styles.postTabTextActive,
            ]}
          >
            {tab === "posts"
              ? "Posts"
              : tab === "reposts"
                ? "Reposts"
                : "Mentions"}
          </Text>
          {profileTab === tab && <View style={styles.postTabActiveBar} />}
        </TouchableOpacity>
      ))}
    </View>
  ) : null;

  const profileHeader = (
    <View>
      {/* Cover banner — always shown (gradient fallback), Facebook style */}
      <View style={styles.bannerWrap}>
        {user?.bannerUrl ? (
          <Image source={{ uri: user.bannerUrl }} style={styles.bannerImage} />
        ) : (
          <LinearGradient
            colors={["rgba(124,58,237,0.55)", "rgba(6,182,212,0.35)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.bannerImage}
          />
        )}
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.5)"]}
          style={styles.bannerShade}
        />
        {/* Fade the banner into the page background. Starts FULLY transparent
            (no visible band mid-banner — a semi-transparent top edge is what
            created the "broken gradient" line) and ends at the exact page
            color so the merge is seamless. The bannerShade beneath supplies
            the text scrim. */}
        <LinearGradient
          colors={["transparent", colors.bg.base]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.bannerFade}
        />
      </View>

      {/* Identity row — avatar overlaps the banner */}
      <View style={styles.profileRow}>
        <View style={styles.avatarWrap}>
          <LinearGradient
            colors={[colors.primary, colors.cyanDark]}
            style={styles.avatar}
          >
            {user?.avatarUrl ? (
              <Image
                source={{ uri: user.avatarUrl }}
                style={styles.avatarImage}
              />
            ) : (
              <Text style={styles.avatarEmoji}>👾</Text>
            )}
          </LinearGradient>
          <LinearGradient
            colors={[colors.xpGold, colors.xpOrange]}
            style={styles.levelBadge}
          >
            <Text style={styles.levelText}>{user?.level || 1}</Text>
          </LinearGradient>
          {(() => {
            const indicator = activeStatusIndicator(user?.activeStatus);
            if (!indicator) return null;
            return (
              <View
                style={{
                  position: "absolute",
                  top: 4,
                  right: 4,
                  width: 18,
                  height: 18,
                  borderRadius: 9,
                  alignItems: "center",
                  justifyContent: "center",
                  // Border kept thin so the icon fills the circle instead of
                  // drowning in a fat ring (the "awkward" look before).
                  borderWidth: 2,
                  borderColor: colors.bg.base,
                  backgroundColor:
                    indicator === "online"
                      ? colors.primary
                      : "rgba(124,58,237,0.18)",
                }}
              >
                {indicator === "recent" ? (
                  // Clock glyph sized to fill the bubble (Ionicons "time" has
                  // generous internal padding, so size ~12 inside an 18px ring).
                  <Ionicons
                    name="time"
                    size={12}
                    color="rgba(124,58,237,0.9)"
                  />
                ) : null}
              </View>
            );
          })()}
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.name}>{user?.name || "Taddle User"}</Text>
          <View style={styles.handleRow}>
            <Text style={styles.handleRank}>@{user?.username || "user"}</Text>
            {user?.privacy === "private" && (
              <Ionicons
                name="lock-closed"
                size={12}
                color={colors.text.muted}
              />
            )}
          </View>
        </View>
      </View>

      {/* Bio + location + links — Instagram-style, below the identity row */}
      <View style={styles.bioSection}>
        {/* No placeholder when the bio is empty — nothing renders (Instagram-style). */}
        {user?.bio ? (
          <BioText
            text={user.bio}
            style={styles.bio}
            colors={colors}
            onLinkPress={setBrowserUrl}
          />
        ) : null}
        {!!user?.location && (
          <View style={styles.locationRow}>
            <Ionicons
              name="location-outline"
              size={13}
              color={colors.text.muted}
            />
            <Text style={styles.locationText} numberOfLines={1}>
              {user.location}
            </Text>
          </View>
        )}
        {/* Organization / college — sits right next to the location, with an
            icon that matches the account's occupation (college for students,
            briefcase for professionals, generic org otherwise). */}
        {(() => {
          const orgName =
            typeof user?.organization === "string"
              ? user.organization
              : user?.organization?.name || user?.organization?.type || "";
          if (!orgName || orgName === "None") return null;
          return (
            <View style={styles.locationRow}>
              <Ionicons
                name={
                  user?.occupation === "Student"
                    ? "school-outline"
                    : user?.occupation === "Working Professional"
                      ? "briefcase-outline"
                      : "business-outline"
                }
                size={13}
                color={colors.text.muted}
              />
              <Text style={styles.locationText} numberOfLines={1}>
                {orgName}
              </Text>
            </View>
          );
        })()}
        {!!user?.websiteUrl && (
          <TouchableOpacity
            style={styles.linkRow}
            activeOpacity={0.7}
            onPress={() => setBrowserUrl(normalizeUrl(user.websiteUrl))}
          >
            <Ionicons
              name="link-outline"
              size={13}
              color={colors.primaryLight}
            />
            <Text style={styles.linkText} numberOfLines={1}>
              {user.websiteUrl.replace(/^https?:\/\//, "")}
            </Text>
          </TouchableOpacity>
        )}
        {/* Instagram-style "Followed by…" — under the bio, shown on every
            account (private or not) EXCEPT the viewer's own profile. */}
        {mutualUsers.length > 0 && (
          <TouchableOpacity
            style={styles.mutualRow}
            activeOpacity={0.7}
            onPress={() => {
              setFollowListType("mutuals");
              setShowFollowList(true);
            }}
          >
            <View style={styles.mutualAvatars}>
              {mutualUsers.map((u: any, i: number) => (
                <View
                  key={i}
                  style={[
                    styles.mutualAvatar,
                    {
                      marginLeft: i === 0 ? 0 : -8,
                      zIndex: mutualUsers.length - i,
                    },
                  ]}
                >
                  {u.avatar ? (
                    <Image
                      source={{ uri: u.avatar }}
                      style={styles.mutualAvatarImg}
                    />
                  ) : (
                    <Text style={styles.mutualAvatarText}>
                      {(u.name || u.username || "?")[0].toUpperCase()}
                    </Text>
                  )}
                </View>
              ))}
            </View>
            <Text style={styles.mutualText} numberOfLines={1}>
              Followed by{" "}
              <Text style={styles.mutualName}>
                {mutualUsers.map((u: any) => u.name || u.username).join(", ")}
              </Text>
              {mutualCount > mutualUsers.length && (
                // Nested <Text> (NOT a fragment) — fragments carrying raw
                // text nodes inside <Text> trigger RN's "Text strings must be
                // rendered within a <Text> component" error.
                <Text style={styles.mutualText}>
                  {" "}
                  and{" "}
                  <Text style={styles.mutualName}>
                    {mutualCount - mutualUsers.length}{" "}
                    {mutualCount - mutualUsers.length === 1
                      ? "other"
                      : "others"}
                  </Text>
                </Text>
              )}
            </Text>
            <Ionicons
              name="chevron-forward"
              size={14}
              color={colors.text.muted}
              style={{ marginLeft: 2 }}
            />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statVal}>
            {(user?.postCount || 0).toLocaleString()}
          </Text>
          <Text style={styles.statLabel}>Posts</Text>
        </View>
        {isLocked ? (
          // Private + not approved — count only, no tappable list.
          <View style={styles.statItem}>
            <Text style={styles.statVal}>
              {(user?.followerCount || 0).toLocaleString()}
            </Text>
            <Text style={styles.statLabel}>Followers</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.statItem}
            onPress={() => openFollowList("followers")}
          >
            <Text style={styles.statVal}>
              {(user?.followerCount || 0).toLocaleString()}
            </Text>
            <Text style={styles.statLabel}>Followers</Text>
          </TouchableOpacity>
        )}
        {isLocked ? (
          <View style={styles.statItem}>
            <Text style={styles.statVal}>
              {(user?.followingCount || 0).toLocaleString()}
            </Text>
            <Text style={styles.statLabel}>Following</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.statItem}
            onPress={() => openFollowList("following")}
          >
            <Text style={styles.statVal}>
              {(user?.followingCount || 0).toLocaleString()}
            </Text>
            <Text style={styles.statLabel}>Following</Text>
          </TouchableOpacity>
        )}
        <View style={styles.statItem}>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            style={[styles.statVal, { color: colors.xpGold }]}
          >
            {user?.rank || "Beginner"}
          </Text>
          {/* Rank icon replaces the old "Rank" label text — the rank name
                (Beginner/Pro/...) stays as the value, the icon sits below it. */}
          <Ionicons
            name="ribbon"
            size={14}
            color={colors.xpGold}
            style={{ marginTop: 3 }}
          />
        </View>
      </View>

      <View style={styles.btnRow}>
        {isOwnProfile ? (
          <TouchableOpacity
            style={styles.editBtn}
            onPress={() => navigation.navigate("EditProfile")}
          >
            <Ionicons
              name="pencil-outline"
              size={14}
              color={colors.text.primary}
            />
            <Text style={styles.editBtnText}>Edit Profile</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            disabled={loadingProfile}
            onPress={handleFollowToggle}
            style={[
              styles.primaryBtn,
              (followed || followStatus === "pending") &&
                styles.primaryBtnActive,
              loadingProfile && { opacity: 0.5 },
            ]}
          >
            {loadingProfile ? (
              <StateBlock inline loading loaderSize={18} />
            ) : (
              <>
                {followed ? (
                  <Ionicons
                    name="checkmark"
                    size={16}
                    color={colors.text.primary}
                    style={{ marginRight: 6 }}
                  />
                ) : followStatus === "pending" ? (
                  <Ionicons
                    name="time-outline"
                    size={16}
                    color={colors.text.primary}
                    style={{ marginRight: 6 }}
                  />
                ) : (
                  <Ionicons
                    name="person-add-outline"
                    size={16}
                    color="#fff"
                    style={{ marginRight: 6 }}
                  />
                )}
                <Text
                  style={[
                    styles.primaryBtnText,
                    (followed || followStatus === "pending") &&
                      styles.primaryBtnTextActive,
                  ]}
                >
                  {followed
                    ? "Following"
                    : followStatus === "pending"
                      ? "Requested"
                      : user?.privacy === "private"
                        ? "Request to Follow"
                        : "Follow"}
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {!isOwnProfile && (
          <>
            {followed && (
              <TouchableOpacity
                style={styles.shareBtn}
                onPress={() => navigation.push("Chat", { conversationId: user?.id, otherUserId: user?.id, otherUser: user } as never)}
              >
                <Ionicons name="chatbubbles-outline" size={18} color={colors.text.primary} />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.shareBtn}
              onPress={handleBookmarkToggle}
            >
              <Ionicons name={isBookmarked ? "bookmark" : "bookmark-outline"} size={18} color={isBookmarked ? colors.primary : colors.text.secondary} />
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity
          style={styles.shareBtn}
          onPress={() => setQrModalVisible(true)}
        >
          <Ionicons
            name="qr-code-outline"
            size={18}
            color={colors.text.secondary}
          />
        </TouchableOpacity>
      </View>

      {isOwnProfile && (user?.pendingRequestsCount || 0) > 0 && (
        <TouchableOpacity
          style={[
            styles.requestsBanner,
            {
              backgroundColor: "rgba(124,58,237,0.12)",
              borderColor: "rgba(124,58,237,0.35)",
            },
          ]}
          activeOpacity={0.8}
          onPress={() => navigation.navigate("FollowRequests")}
        >
          <View style={styles.requestsBannerIcon}>
            <Ionicons name="person-add" size={16} color={colors.primaryLight} />
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={[
                styles.requestsBannerTitle,
                { color: colors.text.primary },
              ]}
            >
              Pending follow requests
            </Text>
            <Text
              style={[
                styles.requestsBannerSub,
                { color: colors.text.secondary },
              ]}
            >
              {user.pendingRequestsCount}{" "}
              {user.pendingRequestsCount === 1 ? "person" : "people"} want to
              follow you
            </Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={18}
            color={colors.text.muted}
          />
        </TouchableOpacity>
      )}

      {isOwnProfile && (
        <XPProgressBar
          level={user?.level || 1}
          rank={user?.rank || "Beginner"}
          currentXP={user?.totalXpEarned || user?.xp || 0}
          targetXP={user?.xpToNext || 1000}
        />
      )}

      {/* Achievements are hidden on private accounts the viewer doesn't
          follow yet — they're part of the gated profile content. */}
      {!isLocked && (user?.badges || []).length > 0 && (
        <View style={styles.achievementsCard}>
          <Text style={styles.sectionLabel}>Achievements 🏆</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.badgeScroll}
          >
            {(user?.badges || []).map((b: any) => {
              const bs = BADGE_COLORS[b.color] ?? {
                bg: colors.bg.elevated,
                border: colors.border,
              };
              return (
                <View key={b.id} style={styles.badgeItem}>
                  <View
                    style={[
                      styles.badgeWrap,
                      { backgroundColor: bs.bg, borderColor: bs.border },
                      b.color === "locked" && { opacity: 0.38 },
                    ]}
                  >
                    <Text style={styles.badgeEmoji}>{b.emoji}</Text>
                  </View>
                  <Text style={styles.badgeName}>{b.name}</Text>
                </View>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Posts / Reposts / Mentions — below the achievements card, at the
          bottom of the scrolling profile header. */}
      {profileTabs}
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      {headerComponent}

      {isLocked ? (
        <PullToRefreshWrapper {...refreshProps}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingTop: headerHeight }}
          >
            {profileHeader}
            <View style={{ padding: 48, alignItems: "center", gap: 12 }}>
              <View style={styles.lockCircle}>
                <Ionicons
                  name="lock-closed"
                  size={32}
                  color={colors.text.muted}
                />
              </View>
              <Text style={[styles.lockTitle, { color: colors.text.primary }]}>
                This account is private
              </Text>
              <Text style={[styles.lockSub, { color: colors.text.muted }]}>
                {followStatus === "pending"
                  ? "Your follow request is waiting for approval."
                  : `Follow @${user?.username || "user"} to see their posts and achievements.`}
              </Text>
            </View>
          </ScrollView>
        </PullToRefreshWrapper>
      ) : // Mentions tab — notification-style list (own profile only). Spinner on
      // first load, paginated via onEndReached like the notifications screen.
      profileTab === "mentions" ? (
        <PullToRefreshWrapper {...refreshProps}>
          <FlatList
            ref={mentionsListRef}
            data={mentions}
            keyExtractor={(item: any) => String(item.id)}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={profileHeader}
            contentContainerStyle={{
              paddingTop: headerHeight,
              paddingBottom: 24,
              flexGrow: 1,
            }}
            contentOffset={
              profileScrollOffset.current
                ? { x: 0, y: profileScrollOffset.current }
                : undefined
            }
            onScroll={(e: any) => {
              profileScrollOffset.current = e.nativeEvent.contentOffset.y;
            }}
            scrollEventThrottle={16}
            renderItem={({ item }: any) => renderMentionRow(item)}
            onEndReached={() => {
              if (hasMoreMentions && !loadingMoreMentions) {
                setLoadingMoreMentions(true);
                loadMentions(mentionPage + 1, true).finally(() =>
                  setLoadingMoreMentions(false),
                );
              }
            }}
            onEndReachedThreshold={0.4}
            ListEmptyComponent={
              loadingMentions ? (
                <StateBlock loading style={{ paddingVertical: 40 }} />
              ) : (
                <View
                  style={{
                    flex: 1,
                    padding: 40,
                    alignItems: "center",
                    justifyContent: "center",
                    minHeight: Dimensions.get("window").height - 150,
                  }}
                >
                  <Ionicons
                    name="at-circle-outline"
                    size={48}
                    color={colors.text.muted}
                    style={{ marginBottom: 12, opacity: 0.5 }}
                  />
                  <Text
                    style={{
                      color: colors.text.muted,
                      textAlign: "center",
                      fontSize: 15,
                    }}
                  >
                    No mentions yet. When someone @mentions you, it shows up
                    here.
                  </Text>
                </View>
              )
            }
            ListFooterComponent={
              loadingMoreMentions && mentions.length > 0 ? (
                <StateBlock inline loading style={{ paddingVertical: 14 }} />
              ) : (
                <View style={{ height: 80 }} />
              )
            }
          />
        </PullToRefreshWrapper>
      ) : (
        <SharedFeed
          rows={posts}
          onDelete={handleDeletePost}
          onReposted={loadPosts}
          refreshing={refreshing}
          onRefresh={onRefresh}
          onLike={async (id) => {
            const row = posts.find((p) => p.id === id);
            if (!row || !row.data) return;
            const currentLikes = row.data.likes ?? 0;
            const newLikes = row.data.isLiked
              ? Math.max(0, currentLikes - 1)
              : currentLikes + 1;
            setPosts((prev) =>
              prev.map((p) =>
                p.id !== id
                  ? p
                  : { ...p, data: { ...p.data, isLiked: !p.data.isLiked, likes: newLikes, likesCount: newLikes } },
              ),
            );
            await postsService.toggleLike(id, !!row.data.isLiked).catch(() => {});
          }}
          onSave={async (id) => {
            const row = posts.find((p) => p.id === id);
            if (!row || !row.data) return;
            setPosts((prev) =>
              prev.map((p) => (p.id !== id ? p : { ...p, data: { ...p.data, isSaved: !p.data.isSaved } })),
            );
            await postsService.toggleSave(id, !!row.data.isSaved).catch(() => {});
          }}
          ListHeaderComponent={profileHeader}
          ListEmptyComponent={
            loadingPosts ? (
              <StateBlock loading style={{ paddingVertical: 40 }} />
            ) : (
              <View
                style={{
                  flex: 1,
                  padding: 40,
                  alignItems: "center",
                  justifyContent: "center",
                  minHeight: Dimensions.get("window").height - 150,
                }}
              >
                <Ionicons
                  name="document-text-outline"
                  size={48}
                  color={colors.text.muted}
                  style={{ marginBottom: 12, opacity: 0.5 }}
                />
                <Text
                  style={{
                    color: colors.text.muted,
                    textAlign: "center",
                    fontSize: 15,
                  }}
                >
                  {profileTab === "reposts"
                    ? "No reposts yet."
                    : "No posts yet."}
                </Text>
              </View>
            )
          }
          ListFooterComponent={<View style={{ height: 100 }} />}
          contentContainerStyle={{ flexGrow: 1 }}
          // View counts are shown ONLY on the profile page, never in the
          // main feed / community feeds.
          showViews
          // Keep the header + tab bar at the same scroll spot when this list
          // remounts after a visit to the Mentions tab (it unmounts during
          // mentions, and a fresh mount starts at the top).
          onScroll={(y) => {
            profileScrollOffset.current = y;
          }}
          initialScrollOffset={profileScrollOffset.current}
        />
      )}

      {/* Deep-linked post (from a notification) opens inside this profile page */}
      <CommentsModal
        visible={openCommentVisible}
        onClose={() => setOpenCommentVisible(false)}
        post={openCommentPost}
      />

      {/* QR Code Modal */}
      {qrModalVisible && (
        <View
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: "rgba(0,0,0,0.8)",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
          }}
        >
          <View
            style={{
              backgroundColor: colors.bg.card,
              padding: 32,
              borderRadius: 24,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontSize: 20,
                fontWeight: "700",
                color: colors.text.primary,
                marginBottom: 8,
              }}
            >
              Share Profile
            </Text>
            <Text
              style={{
                fontSize: 14,
                color: colors.text.secondary,
                marginBottom: 24,
              }}
            >
              Scan to follow @{user?.username}
            </Text>

            <View
              style={{
                width: 200,
                height: 200,
                backgroundColor: "#fff",
                borderRadius: 16,
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 24,
                overflow: "hidden",
                position: "relative",
              }}
            >
              <Image
                source={{
                  uri: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&ecc=H&data=taddlebox://user/${user?.username}`,
                }}
                style={{ width: 180, height: 180 }}
              />
              <View style={{ position: "absolute" }}>
                <BrandedLottieLoader size={48} />
              </View>
            </View>

            <View style={{ flexDirection: "row", gap: 16 }}>
              <TouchableOpacity
                style={{
                  backgroundColor: colors.bg.base,
                  paddingVertical: 12,
                  paddingHorizontal: 32,
                  borderRadius: 100,
                  borderWidth: 1,
                  borderColor: colors.border
                }}
                onPress={() => setQrModalVisible(false)}
              >
                <Text style={{ color: colors.text.primary, fontWeight: "600", fontSize: 16 }}>
                  Close
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{
                  backgroundColor: colors.primary,
                  paddingVertical: 12,
                  paddingHorizontal: 32,
                  borderRadius: 100,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8
                }}
                onPress={() => {
                  Share.share({
                    message: `Follow @${user?.username} on TADDLEBOX!\n\ntaddlebox://user/${user?.username}`
                  });
                }}
              >
                <Ionicons name="share-outline" size={20} color="#fff" />
                <Text style={{ color: "#fff", fontWeight: "600", fontSize: 16 }}>
                  Share
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Follow List Modal — data ships inline with the profile response so no
          extra followers/following/mutuals API round-trips are needed. */}
      {showFollowList && (
        <FollowListModal
          visible={showFollowList}
          onClose={() => setShowFollowList(false)}
          type={followListType}
          user={user}
          isOwnProfile={isOwnProfile}
          styles={styles}
          colors={colors}
          onFollowerRemoved={() =>
            setUser((prev: any) => ({
              ...prev,
              followerCount: Math.max(0, (prev.followerCount || 0) - 1),
            }))
          }
        />
      )}

      {/* In-app browser for profile/bio links — stays inside the app */}
      {browserUrl && (
        <View
          style={[
            StyleSheet.absoluteFill,
            { zIndex: 1000, backgroundColor: colors.bg.base },
          ]}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: spacing.lg,
              paddingVertical: 12,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}
          >
            <Text
              style={{
                flex: 1,
                fontSize: fontSizes.md,
                fontWeight: "700",
                color: colors.text.primary,
                marginRight: 12,
              }}
              numberOfLines={1}
            >
              {browserUrl.replace(/^https?:\/\//, "")}
            </Text>
            <TouchableOpacity
              onPress={() => setBrowserUrl(null)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={22} color={colors.text.secondary} />
            </TouchableOpacity>
          </View>
          <WebView
            source={{ uri: browserUrl }}
            style={{ flex: 1 }}
            javaScriptEnabled
            domStorageEnabled
            originWhitelist={["*"]}
            startInLoadingState
            renderLoading={() => (
              <StateBlock
                loading
                style={{ flex: 1, justifyContent: "center" }}
              />
            )}
          />
        </View>
      )}
    </View>
  );
}

function FollowListModal({
  visible,
  onClose,
  type,
  user,
  isOwnProfile,
  styles,
  colors,
  onFollowerRemoved,
}: any) {
  const navigation = useNavigation<any>();
  // Paginated server fetch — the profile response only ships the first 50
  // inline, so the modal loads the REST page-by-page via onEndReached. The
  // inline list seeds the first screen so it still renders instantly.
  const source = React.useMemo(() => {
    if (type === "followers") return user?.followers || [];
    if (type === "following") return user?.following || [];
    return user?.mutuals?.users || [];
  }, [type, user]);
  const [users, setUsers] = useState<any[]>(source);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Debounce search query so we don't spam the backend
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const fetchPage = React.useCallback(
    async (nextPage: number, refresh = false, searchStr = debouncedSearch) => {
      const username = user?.username;
      if (!username) return;
      if (!refresh) setLoading(true);
      try {
        const res =
          type === "followers"
            ? await userService.getFollowers(username, nextPage, 20, searchStr)
            : type === "following"
              ? await userService.getFollowing(
                  username,
                  nextPage,
                  20,
                  searchStr,
                )
              : await userService.getMutuals(username, nextPage, 20, searchStr);
        const rows = res?.data || [];
        const meta = res?.meta;
        // Server returns page*limit sized pages → more exists when a full page
        // came back (meta.hasNext is the authoritative signal when present).
        setHasMore(meta ? !!meta.hasNext : rows.length === 20);
        setUsers((prev) =>
          refresh
            ? rows
            : [
                ...prev,
                ...rows.filter(
                  (r: any) =>
                    !prev.some(
                      (p: any) => (p.id || p.user_id) === (r.id || r.user_id),
                    ),
                ),
              ],
        );
        setPage(nextPage);
      } catch (e) {
        warn("Failed to load user list", e);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [type, user?.username],
  );

  // Reset + fetch the first page when opened (or when the target/search changes).
  React.useEffect(() => {
    if (visible) {
      setUsers(source);
      setPage(1);
      setHasMore(false);
      fetchPage(1, true, debouncedSearch);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, type, user?.username, debouncedSearch]);

  const handleUnfollow = async (targetUsername: string) => {
    try {
      await userService.unfollowUser(targetUsername);
      setUsers((prev) => prev.filter((u) => u.username !== targetUsername));
    } catch (e) {
      log("Failed to unfollow", e);
    }
  };

  // Own profile, followers tab: remove a follower (not a block — they can
  // re-follow). Reflects instantly in the list + the follower count chip.
  const handleRemoveFollower = async (targetUsername: string) => {
    try {
      await userService.removeFollower(targetUsername);
      setUsers((prev) => prev.filter((u) => u.username !== targetUsername));
      onFollowerRemoved?.();
    } catch (e) {
      warn("Failed to remove follower", e);
      themedAlert("Error", "Failed to remove follower. Please try again.");
    }
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "height" : undefined}
        style={{ flex: 1 }}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {type === "followers"
                  ? "Followers"
                  : type === "mutuals"
                    ? "Mutuals"
                    : "Following"}
              </Text>
              <TouchableOpacity onPress={onClose}>
                <Ionicons
                  name="close"
                  size={24}
                  color={colors.text.secondary}
                />
              </TouchableOpacity>
            </View>

            {/* Search bar */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: colors.bg.elevated,
                borderRadius: 12,
                paddingHorizontal: 12,
                marginBottom: 12,
              }}
            >
              <Ionicons name="search" size={18} color={colors.text.muted} />
              <TextInput
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  paddingHorizontal: 8,
                  color: colors.text.primary,
                  fontSize: 14,
                }}
                placeholder={`Search ${type === "followers" ? "followers" : type === "mutuals" ? "mutuals" : "following"}...`}
                placeholderTextColor={colors.text.muted}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCorrect={false}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery("")}>
                  <Ionicons
                    name="close-circle"
                    size={18}
                    color={colors.text.muted}
                  />
                </TouchableOpacity>
              )}
            </View>

            {loading ? (
              <Text
                style={{
                  color: colors.text.muted,
                  textAlign: "center",
                  padding: 20,
                }}
              >
                Loading...
              </Text>
            ) : users.length === 0 ? (
              <Text
                style={{
                  color: colors.text.muted,
                  textAlign: "center",
                  padding: 20,
                }}
              >
                No one here yet.
              </Text>
            ) : (
              <FlatList
                data={users}
                keyExtractor={(item, index) =>
                  item.id || item.user_id || String(index)
                }
                onEndReached={() => {
                  if (hasMore && !loading) fetchPage(page + 1);
                }}
                onEndReachedThreshold={0.4}
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true);
                  fetchPage(1, true, debouncedSearch);
                }}
                contentContainerStyle={{ paddingBottom: 20 }}
                ListFooterComponent={
                  loading && users.length > 0 ? (
                    <StateBlock
                      inline
                      loading
                      style={{ paddingVertical: 14 }}
                    />
                  ) : null
                }
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.userRow}
                    onPress={() => {
                      onClose();
                      navigation.push("UserProfile", { user: item });
                    }}
                  >
                    <View style={styles.userInfo}>
                      <View style={{ position: "relative" }}>
                        <View style={styles.userAvatar}>
                          {item.avatarUrl || item.avatar_url || item.avatar ? (
                            <Image
                              source={{
                                uri:
                                  item.avatarUrl ||
                                  item.avatar_url ||
                                  item.avatar,
                              }}
                              style={{ width: "100%", height: "100%" }}
                            />
                          ) : (
                            <Text style={{ fontSize: 20 }}>👾</Text>
                          )}
                        </View>
                        <ActiveStatusDot
                          userId={item.id || item.user_id}
                          size={13}
                        />
                      </View>
                      <View>
                        <Text style={styles.userName}>
                          {item.name || item.username}
                        </Text>
                        <Text style={styles.userHandle}>@{item.username}</Text>
                      </View>
                    </View>
                    {(type === "following" || type === "mutuals") && (
                      // Mutuals are, by definition, people the viewer already
                      // follows — offer Unfollow right from the list.
                      <TouchableOpacity
                        style={styles.unfollowBtn}
                        onPress={() => handleUnfollow(item.username)}
                      >
                        <Text style={styles.unfollowBtnText}>Unfollow</Text>
                      </TouchableOpacity>
                    )}
                    {isOwnProfile && type === "followers" && (
                      <TouchableOpacity
                        style={styles.unfollowBtn}
                        onPress={() => handleRemoveFollower(item.username)}
                      >
                        <Text style={styles.unfollowBtnText}>Remove</Text>
                      </TouchableOpacity>
                    )}
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
