import React, { useMemo, useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  FlatList,
  Image,
  Alert,
  RefreshControl,
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
import SharedFeed from "../common/SharedFeed";
import { postsService } from "../../services/posts.service";

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
      top: 0, bottom: 0, left: 0, right: 0,
    },
    bannerEditBtn: {
      position: "absolute",
      top: 12, right: 12,
      flexDirection: "row", alignItems: "center", gap: 5,
      backgroundColor: "rgba(0,0,0,0.45)",
      paddingVertical: 6, paddingHorizontal: 12,
      borderRadius: radii.full,
    },
    bannerEditText: { fontSize: fontSizes.xs, fontWeight: "700", color: "#fff" },
    heroGrad: { paddingBottom: 4 },
    profileRow: {
      flexDirection: "row",
      gap: 16,
      alignItems: "flex-end",
      marginTop: -48,
      paddingHorizontal: spacing.xl,
      paddingBottom: 14,
      // Solid page background behind the identity block — the avatar still
      // overlaps the banner (Facebook style) but the name/bio/links sit on a
      // solid surface so the banner image never covers or hides them.
      backgroundColor: c.bg.base,
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
    name: { fontSize: fontSizes.xxl, fontWeight: "800", color: c.text.primary, marginBottom: 2 },
    handleRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
    handleRank: {
      fontSize: fontSizes.sm,
      color: c.text.muted,
      fontWeight: "600",
    },
    bio: { fontSize: fontSizes.sm, color: c.text.secondary, lineHeight: 18 },
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

    infoCard: {
      marginHorizontal: spacing.lg,
      marginVertical: spacing.md,
      backgroundColor: c.bg.card,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      gap: 10,
    },
    infoRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    infoLabel: { fontSize: fontSizes.xs, color: c.text.muted, width: 90 },
    infoValue: {
      flex: 1,
      fontSize: fontSizes.sm,
      fontWeight: "600",
      color: c.text.primary,
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
}

export default function SharedProfile({
  initialUser,
  isOwnProfile,
  headerComponent,
}: SharedProfileProps) {
  const { isDark } = useTheme();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const navigation = useNavigation<any>();

  const [user, setUser] = useState<any>(initialUser);
  const [followed, setFollowed] = useState(!!initialUser?.isFollowing);
  const [followStatus, setFollowStatus] = useState<string | null>(
    initialUser?.followStatus || null
  );
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [qrModalVisible, setQrModalVisible] = useState(false);

  const [showFollowList, setShowFollowList] = useState(false);
  const [followListType, setFollowListType] = useState<
    "followers" | "following"
  >("followers");
  // In-app browser — profile/bio links open here instead of the system browser.
  const [browserUrl, setBrowserUrl] = useState<string | null>(null);

  const { user: currentUser } = useAuth();
  const [posts, setPosts] = useState<any[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(true);

  const handleDeletePost = async (post: any) => {
    Alert.alert("Delete Post", "Are you sure you want to delete this post?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await postsService.deletePost(post.id);
            setPosts((prev) => prev.filter((p: any) => p.id !== post.id));
          } catch (e) {
            console.warn("Failed to delete post", e);
          }
        },
      },
    ]);
  };

  const loadProfile = useCallback(async () => {
    const username = initialUser?.username || "";
    if (!username) return;
    try {
      const profileRes = await userService.getProfile(username);
      if (profileRes?.data) {
        setUser(profileRes.data);
        setFollowed(!!profileRes.data.isFollowing);
        setFollowStatus(profileRes.data.followStatus || null);
      }
    } catch (e) {
      console.warn("Failed to load profile", e);
    } finally {
      setLoadingProfile(false);
    }
  }, [initialUser?.username]);

  const loadPosts = useCallback(async () => {
    try {
      if (!user?.id) return;
      // Private accounts: don't even ask the API for posts the viewer can't see.
      if (!isOwnProfile && user?.privacy === "private" && !followed) {
        setPosts([]);
        setLoadingPosts(false);
        return;
      }
      setLoadingPosts(true);
      const postsRes = await postsService.getUserPosts(user.id);
      if (postsRes?.data) {
        setPosts(postsRes.data);
      }
    } catch (e) {
      console.warn("Failed to load user posts", e);
    } finally {
      setLoadingPosts(false);
    }
  }, [user?.id, user?.privacy, followed, isOwnProfile]);

  useEffect(() => {
    if (user?.id) loadPosts();
  }, [user?.id, user?.privacy, followed, isOwnProfile, loadPosts]);

  // Refetch profile + posts whenever the screen regains focus so follower/post/
  // XP counts stay fresh (e.g. new followers or posts while away) without a
  // manual pull-to-refresh.
  useFocusEffect(
    useCallback(() => {
      loadProfile();
      if (user?.id) loadPosts();
    }, [loadProfile, loadPosts, user?.id])
  );

  // Private accounts hide their posts until the viewer is an approved follower.
  const isLocked =
    !isOwnProfile && user?.privacy === "private" && !followed;

  const handleFollowToggle = async () => {
    try {
      if (followed) {
        await userService.unfollowUser(user.username);
        setFollowed(false);
        setFollowStatus(null);
        setUser((prev: any) => ({
          ...prev,
          followerCount: Math.max(0, (prev.followerCount || 0) - 1),
        }));
      } else if (followStatus === "pending") {
        // Cancel a pending follow request.
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
      console.warn("Failed to toggle follow", e);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadProfile();
      if (
        user?.id &&
        !(!isOwnProfile && user?.privacy === "private" && !followed)
      ) {
        const postsRes = await postsService.getUserPosts(user.id);
        if (postsRes?.data) setPosts(postsRes.data);
      }
    } catch (e) {
      console.warn("Failed to refresh profile", e);
    } finally {
      setRefreshing(false);
    }
  }, [loadProfile, user?.id, isOwnProfile, followed]);

  const refreshControl = (
    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
  );

  const openFollowList = (type: "followers" | "following") => {
    // Private account + not an approved follower: counts stay visible but the
    // list itself is gated (same rule the backend enforces with a 403).
    if (isLocked) {
      Alert.alert(
        "Private Account",
        `Follow @${user?.username || "user"} to see their ${type === "followers" ? "followers" : "following"}.`
      );
      return;
    }
    setFollowListType(type);
    setShowFollowList(true);
  };

  // Instagram-style "Followed by x, y and N others" — backend computes the
  // mutuals for the logged-in viewer (hidden for locked private accounts).
  const mutualUsers = (user?.mutuals?.users || []).slice(0, 2);
  const mutualCount = user?.mutuals?.count || mutualUsers.length;

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
        {isOwnProfile && (
          <TouchableOpacity
            style={styles.bannerEditBtn}
            activeOpacity={0.8}
            onPress={() => navigation.navigate("EditProfile")}
          >
            <Ionicons name="camera-outline" size={13} color="#fff" />
            <Text style={styles.bannerEditText}>Edit Cover</Text>
          </TouchableOpacity>
        )}
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
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.name}>{user?.name || "Taddle User"}</Text>
          <View style={styles.handleRow}>
            <Text style={styles.handleRank}>
              @{user?.username || "user"}
            </Text>
            {user?.privacy === "private" && (
              <Ionicons name="lock-closed" size={12} color={colors.text.muted} />
            )}
          </View>
          {user?.bio ? (
            <BioText
              text={user.bio}
              style={styles.bio}
              colors={colors}
              onLinkPress={setBrowserUrl}
            />
          ) : (
            <Text style={styles.bio}>No bio yet.</Text>
          )}
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
          {!isOwnProfile && !isLocked && mutualUsers.length > 0 && (
            <View style={styles.mutualRow}>
              <View style={styles.mutualAvatars}>
                {mutualUsers.map((u: any, i: number) => (
                  <View
                    key={i}
                    style={[
                      styles.mutualAvatar,
                      { marginLeft: i === 0 ? 0 : -8, zIndex: mutualUsers.length - i },
                    ]}
                  >
                    {u.avatar ? (
                      <Image source={{ uri: u.avatar }} style={styles.mutualAvatarImg} />
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
                    {" "}and{" "}
                    <Text style={styles.mutualName}>
                      {mutualCount - mutualUsers.length}{" "}
                      {mutualCount - mutualUsers.length === 1 ? "other" : "others"}
                    </Text>
                  </Text>
                )}
              </Text>
            </View>
          )}
        </View>
      </View>          <View style={styles.statsRow}>
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
            <Text style={[styles.statVal, { color: colors.xpGold }]}>
              {(user?.xp || 0).toLocaleString()}
            </Text>
            <Text style={styles.statLabel}>Total XP</Text>
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
                <ActivityIndicator
                  size="small"
                  color={
                    followed || followStatus === "pending"
                      ? colors.primary
                      : "#fff"
                  }
                />
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
              style={[styles.requestsBannerTitle, { color: colors.text.primary }]}
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

      <XPProgressBar
        level={user?.level || 1}
        rank={user?.rank || "Beginner"}
        currentXP={user?.totalXpEarned || user?.xp || 0}
        targetXP={user?.xpToNext || 1000}
      />

      <View style={styles.infoCard}>
        {[
          {
            icon: "school-outline",
            label: "Organization",
            value:
              typeof user?.organization === "string"
                ? user.organization
                : user?.organization?.name ||
                  user?.organization?.type ||
                  "None",
          },
          {
            icon: "people-outline",
            label: "Communities",
            value: `${user?.communitiesJoinedCount || 0} joined`,
          },
          {
            icon: "game-controller-outline",
            label: "Games",
            value: `${user?.gamesPlayedCount || 0} played`,
          },
        ].map((item) => (
          <View key={item.label} style={styles.infoRow}>
            <Ionicons
              name={item.icon as any}
              size={16}
              color={colors.primaryLight}
            />
            <Text style={styles.infoLabel}>{item.label}</Text>
            <Text style={styles.infoValue}>{item.value}</Text>
          </View>
        ))}
      </View>

      {(user?.badges || []).length > 0 && (
        <>
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
        </>
      )}

      <Text style={styles.sectionLabel}>Posts</Text>
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      {headerComponent}

      {isLocked ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl}
        >
          {profileHeader}
          <View style={{ padding: 48, alignItems: "center", gap: 12 }}>
            <View style={styles.lockCircle}>
              <Ionicons name="lock-closed" size={32} color={colors.text.muted} />
            </View>
            <Text style={[styles.lockTitle, { color: colors.text.primary }]}>
              This account is private
            </Text>
            <Text style={[styles.lockSub, { color: colors.text.muted }]}>
              {followStatus === "pending"
                ? "Your follow request is waiting for approval."
                : `Follow @${user?.username || "user"} to see their posts.`}
            </Text>
          </View>
        </ScrollView>
      ) : loadingPosts ? (
        <ScrollView showsVerticalScrollIndicator={false} refreshControl={refreshControl}>
          {profileHeader}
          <View style={{ padding: 40, alignItems: "center" }}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        </ScrollView>
      ) : posts.length === 0 ? (
        <ScrollView showsVerticalScrollIndicator={false} refreshControl={refreshControl}>
          {profileHeader}
          <View style={{ padding: 40, alignItems: "center" }}>
            <Text style={{ color: colors.text.muted }}>No posts yet — pull down to refresh.</Text>
          </View>
        </ScrollView>
      ) : (
        <SharedFeed
          posts={posts}
          setPosts={setPosts}
          onDelete={handleDeletePost}
          refreshing={refreshing}
          onRefresh={onRefresh}
          ListHeaderComponent={profileHeader}
          ListFooterComponent={<View style={{ height: 100 }} />}
          contentContainerStyle={{ gap: 12 }}
        />
      )}

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
              }}
            >
              <Image
                source={{
                  uri: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=taddlebox://user/${user?.username}`,
                }}
                style={{ width: 180, height: 180 }}
              />
            </View>

            <TouchableOpacity
              style={{
                backgroundColor: colors.primary,
                paddingVertical: 12,
                paddingHorizontal: 32,
                borderRadius: 100,
              }}
              onPress={() => setQrModalVisible(false)}
            >
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>
                Close
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Follow List Modal */}
      {showFollowList && (
        <FollowListModal
          visible={showFollowList}
          onClose={() => setShowFollowList(false)}
          type={followListType}
          username={user?.username}
          isOwnProfile={isOwnProfile}
          styles={styles}
          colors={colors}
        />
      )}

      {/* In-app browser for profile/bio links — stays inside the app */}
      {browserUrl && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 1000, backgroundColor: colors.bg.base }]}>
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
            <TouchableOpacity onPress={() => setBrowserUrl(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={22} color={colors.text.secondary} />
            </TouchableOpacity>
          </View>
          <WebView
            source={{ uri: browserUrl }}
            style={{ flex: 1 }}
            javaScriptEnabled
            domStorageEnabled
            originWhitelist={['*']}
            startInLoadingState
            renderLoading={() => (
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
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
  username,
  isOwnProfile,
  styles,
  colors,
}: any) {
  const navigation = useNavigation<any>();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (visible && username) {
      loadData();
    }
  }, [visible, username, type]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (type === "followers") {
        const res = await userService.getFollowers(username);
        setUsers(res.data || []);
      } else {
        const res = await userService.getFollowing(username);
        setUsers(res.data || []);
      }
    } catch (e) {
      console.log("Failed to load list", e);
    } finally {
      setLoading(false);
    }
  };

  const handleUnfollow = async (targetUsername: string) => {
    try {
      await userService.unfollowUser(targetUsername);
      setUsers((prev) => prev.filter((u) => u.username !== targetUsername));
    } catch (e) {
      console.log("Failed to unfollow", e);
    }
  };

  if (!visible) return null;

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 999 }]}>
      <View style={styles.modalContainer}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {type === "followers" ? "Followers" : "Following"}
            </Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.text.secondary} />
            </TouchableOpacity>
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
              keyExtractor={(item, index) => item.id || String(index)}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.userRow}
                  onPress={() => {
                    onClose();
                    navigation.navigate("UserProfile", { user: item });
                  }}
                >
                  <View style={styles.userInfo}>
                    <View style={styles.userAvatar}>
                      {item.avatarUrl || item.avatar_url ? (
                        <Image
                          source={{ uri: item.avatarUrl || item.avatar_url }}
                          style={{ width: "100%", height: "100%" }}
                        />
                      ) : (
                        <Text style={{ fontSize: 20 }}>👾</Text>
                      )}
                    </View>
                    <View>
                      <Text style={styles.userName}>
                        {item.name || item.username}
                      </Text>
                      <Text style={styles.userHandle}>@{item.username}</Text>
                    </View>
                  </View>
                  {isOwnProfile && type === "following" && (
                    <TouchableOpacity
                      style={styles.unfollowBtn}
                      onPress={() => handleUnfollow(item.username)}
                    >
                      <Text style={styles.unfollowBtnText}>Unfollow</Text>
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </View>
    </View>
  );
}

// ─── Bio with tappable links ─────────────────────────────────────────────────
const normalizeUrl = (url: string) => {
  const trimmed = (url || "").trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

function BioText({
  text,
  style,
  colors,
  onLinkPress,
}: {
  text: string;
  style: any;
  colors: any;
  onLinkPress: (url: string) => void;
}) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return (
    <Text style={style}>
      {parts.map((part, i) =>
        part.startsWith("http") ? (
          <Text
            key={i}
            style={{ color: colors.primaryLight, fontWeight: "600" }}
            onPress={() => onLinkPress(normalizeUrl(part))}
          >
            {part}
          </Text>
        ) : (
          <Text key={i}>{part}</Text>
        ),
      )}
    </Text>
  );
}
