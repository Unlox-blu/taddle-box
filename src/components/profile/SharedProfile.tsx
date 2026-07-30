import React, { useMemo, useState, useEffect } from "react";
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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { fontSizes, spacing, radii, type ColorPalette } from "../../theme";
import { useThemeColors, useTheme } from "../../context/ThemeContext";
import { userService } from "../../services/user.service";
import { useAuth } from "../../context/AuthContext";
import XPProgressBar from "../home/XPProgressBar";
import { useNavigation } from "@react-navigation/native";
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
    heroGrad: { paddingBottom: 4 },
    profileRow: {
      flexDirection: "row",
      gap: 16,
      alignItems: "flex-end",
      paddingHorizontal: spacing.xl,
      paddingBottom: 14,
    },
    avatarWrap: { position: "relative" },
    avatar: {
      width: 80,
      height: 80,
      borderRadius: 40,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 3,
      borderColor: c.bg.base,
      overflow: "hidden",
    },
    avatarImage: { width: "100%", height: "100%" },
    avatarEmoji: { fontSize: 36 },
    levelBadge: {
      position: "absolute",
      bottom: -4,
      right: -4,
      width: 26,
      height: 26,
      borderRadius: 13,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 2,
      borderColor: c.bg.base,
    },
    levelText: { fontSize: fontSizes.xs, fontWeight: "800", color: "#1A0A00" },
    profileInfo: { flex: 1 },
    name: { fontSize: fontSizes.xxl, fontWeight: "800", color: c.text.primary },
    handleRank: {
      fontSize: fontSizes.sm,
      color: c.text.muted,
      marginBottom: 4,
    },
    bio: { fontSize: fontSizes.sm, color: c.text.secondary, lineHeight: 18 },

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
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [qrModalVisible, setQrModalVisible] = useState(false);

  const [showFollowList, setShowFollowList] = useState(false);
  const [followListType, setFollowListType] = useState<
    "followers" | "following"
  >("followers");

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

  useEffect(() => {
    let active = true;
    const loadProfile = async () => {
      try {
        const username = initialUser?.username || "";
        if (!username) return;
        const profileRes = await userService.getProfile(username);
        if (active && profileRes?.data) {
          setUser(profileRes.data);
          setFollowed(!!profileRes.data.isFollowing);
        }
      } catch (e) {
        console.warn("Failed to load profile", e);
      } finally {
        if (active) setLoadingProfile(false);
      }
    };
    loadProfile();
    return () => {
      active = false;
    };
  }, [initialUser?.username]);

  useEffect(() => {
    let active = true;
    const loadPosts = async () => {
      try {
        if (!user?.id) return;
        setLoadingPosts(true);
        const postsRes = await postsService.getUserPosts(user.id);
        if (active && postsRes?.data) {
          setPosts(postsRes.data);
        }
      } catch (e) {
        console.warn("Failed to load user posts", e);
      } finally {
        if (active) setLoadingPosts(false);
      }
    };
    if (user?.id) loadPosts();
    return () => {
      active = false;
    };
  }, [user?.id]);

  const handleFollowToggle = async () => {
    try {
      if (followed) {
        await userService.unfollowUser(user.username);
        setFollowed(false);
        setUser((prev: any) => ({
          ...prev,
          followerCount: Math.max(0, (prev.followerCount || 0) - 1),
        }));
      } else {
        await userService.followUser(user.username);
        setFollowed(true);
        setUser((prev: any) => ({
          ...prev,
          followerCount: (prev.followerCount || 0) + 1,
        }));
      }
    } catch (e) {
      console.warn("Failed to toggle follow", e);
    }
  };

  const openFollowList = (type: "followers" | "following") => {
    setFollowListType(type);
    setShowFollowList(true);
  };

  const profileHeader = (
    <View>
      <LinearGradient
        colors={["rgba(124,58,237,0.28)", "transparent"]}
        style={styles.heroGrad}
      >
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
            <Text style={styles.handleRank}>
              @{user?.username || "user"} · 🏅 {user?.rank || "Beginner"}
            </Text>
            <Text style={styles.bio}>{user?.bio || "No bio yet."}</Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statVal}>
              {(user?.postCount || 0).toLocaleString()}
            </Text>
            <Text style={styles.statLabel}>Posts</Text>
          </View>
          <TouchableOpacity
            style={styles.statItem}
            onPress={() => openFollowList("followers")}
          >
            <Text style={styles.statVal}>
              {(user?.followerCount || 0).toLocaleString()}
            </Text>
            <Text style={styles.statLabel}>Followers</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.statItem}
            onPress={() => openFollowList("following")}
          >
            <Text style={styles.statVal}>
              {(user?.followingCount || 0).toLocaleString()}
            </Text>
            <Text style={styles.statLabel}>Following</Text>
          </TouchableOpacity>
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
                followed && styles.primaryBtnActive,
                loadingProfile && { opacity: 0.5 },
              ]}
            >
              {loadingProfile ? (
                <ActivityIndicator
                  size="small"
                  color={followed ? colors.primary : "#fff"}
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
                      followed && styles.primaryBtnTextActive,
                    ]}
                  >
                    {followed ? "Following" : "Follow"}
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
      </LinearGradient>

      <XPProgressBar
        level={user?.level || 1}
        rank={user?.rank || "Beginner"}
        currentXP={user?.xp || 0}
        targetXP={user?.xpToNext || 500}
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

      {loadingPosts ? (
        <ScrollView showsVerticalScrollIndicator={false}>
          {profileHeader}
          <View style={{ padding: 40, alignItems: "center" }}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        </ScrollView>
      ) : posts.length === 0 ? (
        <ScrollView showsVerticalScrollIndicator={false}>
          {profileHeader}
          <View style={{ padding: 40, alignItems: "center" }}>
            <Text style={{ color: colors.text.muted }}>Hang tight!</Text>
          </View>
        </ScrollView>
      ) : (
        <SharedFeed
          posts={posts}
          setPosts={setPosts}
          onDelete={handleDeletePost}
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
