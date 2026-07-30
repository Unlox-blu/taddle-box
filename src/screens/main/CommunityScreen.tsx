import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Modal,
  KeyboardAvoidingView,
  Alert,
  Image,
  Dimensions,
  RefreshControl,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { fontSizes, spacing, radii, type ColorPalette } from "../../theme";
import { useTheme, useThemeColors } from "../../context/ThemeContext";
import { useAuth } from "../../context/AuthContext";
import { useCommunities } from "../../queries/communities";
import {
  useJoinCommunity,
  useCreateCommunity,
} from "../../mutations/communities";
import type { Community, CommunityStackParamList } from "../../types";
import MainHeader from "../../components/common/MainHeader";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import { mediaService } from "../../services/media.service";
import { appLockBypass } from "../../utils/appLockBypass";

type Nav = NativeStackNavigationProp<CommunityStackParamList, "CommunityList">;

const isCloseToBottom = ({
  layoutMeasurement,
  contentOffset,
  contentSize,
}: any) => {
  return layoutMeasurement.height + contentOffset.y >= contentSize.height - 20;
};

const { width } = Dimensions.get("window");
const CARD_WIDTH = width * 0.75;

const BANNER_COLORS: Record<string, [string, string]> = {
  Tech: ["#1e1b4b", "#312e81"],
  Lifestyle: ["#064e3b", "#065f46"],
  Gaming: ["#451a03", "#78350f"],
  Startup: ["#422006", "#713f12"],
  Creative: ["#4a044e", "#701a75"],
  Study: ["#083344", "#164e63"],
  All: ["#0f172a", "#1e293b"],
};

const AVATAR_COLORS: Record<string, [string, string]> = {
  Tech: ["#8b5cf6", "#06b6d4"],
  Lifestyle: ["#10b981", "#059669"],
  Gaming: ["#f97316", "#ea580c"],
  Startup: ["#f59e0b", "#d97706"],
  Creative: ["#ec4899", "#db2777"],
  Study: ["#0ea5e9", "#0284c7"],
  All: ["#6366f1", "#4f46e5"],
};

const CATEGORY_TABS = [
  { label: "All", key: "All", icon: "grid-outline" },
  { label: "Created", key: "Created", icon: "star-outline" },
  { label: "Joined", key: "Joined", icon: "checkmark-circle-outline" },
  { label: "Tech", key: "Tech", icon: "laptop-outline" },
  { label: "Gaming", key: "Gaming", icon: "game-controller-outline" },
  { label: "Lifestyle", key: "Lifestyle", icon: "cafe-outline" },
  { label: "Startups", key: "Startup", icon: "rocket-outline" },
  { label: "Creative", key: "Creative", icon: "color-palette-outline" },
  { label: "Study", key: "Study", icon: "book-outline" },
];

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg.base },

    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: spacing.xl,
      paddingTop: 16,
      paddingBottom: 12,
    },
    heroTitle: {
      fontSize: fontSizes.display,
      fontWeight: "900",
      color: c.text.primary,
      letterSpacing: -1,
      marginBottom: 8,
    },
    subtitle: {
      fontSize: fontSizes.sm,
      color: c.text.secondary,
      marginTop: 4,
      fontWeight: "500",
    },

    createBtnWrap: {
      overflow: "hidden",
      borderRadius: radii.full,
      shadowColor: c.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 5,
    },
    createBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    createBtnText: { color: "#fff", fontWeight: "700", fontSize: fontSizes.sm },

    chipsWrap: { backgroundColor: c.bg.base, paddingVertical: 16 },
    chips: { paddingHorizontal: spacing.xl, gap: 12 },
    chip: {
      paddingVertical: 10,
      paddingHorizontal: 20,
      borderRadius: radii.full,

      backgroundColor: "rgba(70, 55, 55, 0.1)",
      flexDirection: "row",
      alignItems: "center",
    },
    chipActive: {
      borderColor: c.primary,
      backgroundColor: "rgba(124,58,237,0.15)",
      shadowColor: c.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 4,
    },
    chipText: {
      fontSize: fontSizes.sm,
      color: c.text.muted,
      fontWeight: "600",
      letterSpacing: 0.2,
    },
    chipTextActive: { color: c.primaryLight, fontWeight: "800" },

    sectionHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: spacing.xl,
      marginTop: 24,
      marginBottom: 16,
    },
    sectionLabel: {
      fontSize: fontSizes.xl,
      color: c.text.primary,
      fontWeight: "800",
      letterSpacing: -0.5,
    },
    sectionAction: {
      fontSize: fontSizes.sm,
      color: c.primaryLight,
      fontWeight: "600",
    },

    emptyState: {
      alignItems: "center",
      paddingVertical: 60,
      paddingHorizontal: spacing.xl,
    },
    emptyEmoji: { fontSize: 56, marginBottom: 16 },
    emptyTitle: {
      fontSize: fontSizes.xl,
      fontWeight: "800",
      color: c.text.primary,
      marginBottom: 8,
      textAlign: "center",
    },
    emptyDesc: {
      fontSize: fontSizes.sm,
      color: c.text.muted,
      textAlign: "center",
      lineHeight: 22,
    },
    emptyBtn: {
      marginTop: 24,
      backgroundColor: c.primary,
      paddingHorizontal: 32,
      paddingVertical: 14,
      borderRadius: radii.full,
      shadowColor: c.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 8,
    },
    emptyBtnText: { fontSize: fontSizes.md, fontWeight: "700", color: "#fff" },

    /* Featured Horizontal Card */
    featCard: {
      width: CARD_WIDTH,
      marginLeft: spacing.xl,
      backgroundColor: c.bg.card,
      borderRadius: radii.xxl || 24,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.08)",
      shadowColor: c.primary,
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.25,
      shadowRadius: 20,
      elevation: 8,
    },
    featBanner: { height: 140, justifyContent: "center", alignItems: "center" },
    featOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(0,0,0,0.4)",
      justifyContent: "flex-start",
      alignItems: "flex-end",
      padding: 16,
    },
    featBody: { padding: 20, paddingTop: 0 },
    featAvatarWrap: {
      width: 72,
      height: 72,
      borderRadius: radii.xl || 20,
      borderWidth: 4,
      borderColor: c.bg.card,
      marginTop: -36,
      marginBottom: 12,
      overflow: "hidden",
      backgroundColor: c.bg.elevated,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 6,
    },
    featName: {
      fontSize: fontSizes.xl,
      fontWeight: "900",
      color: c.text.primary,
      marginBottom: 6,
      letterSpacing: -0.5,
    },
    featDesc: {
      fontSize: fontSizes.sm,
      color: c.text.secondary,
      lineHeight: 20,
      height: 40,
      marginBottom: 20,
    },
    featFoot: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderTopWidth: 1,
      borderTopColor: "rgba(255,255,255,0.05)",
      paddingTop: 16,
    },
    featStats: { flexDirection: "row", alignItems: "center", gap: 16 },
    featStat: { flexDirection: "row", alignItems: "center", gap: 6 },
    featStatText: {
      fontSize: fontSizes.xs,
      color: c.text.muted,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },

    /* Compact Vertical Card */
    compCard: {
      flexDirection: "row",
      alignItems: "center",
      marginHorizontal: spacing.xl,
      marginBottom: 16,
      backgroundColor: "rgba(255,255,255,0.03)",
      borderRadius: radii.xl || 20,
      padding: 16,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.06)",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 10,
      elevation: 3,
    },
    compAvatarWrap: {
      width: 64,
      height: 64,
      borderRadius: radii.lg || 16,
      overflow: "hidden",
      backgroundColor: c.bg.elevated,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 16,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.1)",
    },
    compInfo: { flex: 1, justifyContent: "center" },
    compName: {
      fontSize: fontSizes.lg,
      fontWeight: "900",
      color: c.text.primary,
      marginBottom: 4,
      letterSpacing: -0.3,
    },
    compStats: {
      fontSize: fontSizes.sm,
      color: c.text.secondary,
      fontWeight: "600",
    },

    joinBtn: {
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderRadius: radii.full,
      backgroundColor: c.primary,
    },
    joinBtnJoined: {
      backgroundColor: "transparent",
      borderWidth: 1,
      borderColor: c.borderHover,
    },
    joinBtnText: { fontSize: fontSizes.xs, fontWeight: "700", color: "#fff" },
    joinBtnTextJoined: { color: c.text.secondary },

    privateBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: "rgba(0,0,0,0.6)",
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: radii.full,
    },
    privateBadgeText: { fontSize: 10, color: "#fff", fontWeight: "700" },

    /* Modal Styles */
    modalContainer: { flex: 1, backgroundColor: c.bg.base },
    modalHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    modalTitle: {
      fontSize: fontSizes.lg,
      fontWeight: "800",
      color: c.text.primary,
    },
    modalContent: { padding: spacing.lg, gap: spacing.md, paddingBottom: 60 },
    fieldLabel: {
      fontSize: fontSizes.sm,
      fontWeight: "700",
      color: c.text.secondary,
    },
    required: { color: c.danger },
    fieldInput: {
      backgroundColor: c.bg.card,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radii.md,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: fontSizes.md,
      color: c.text.primary,
    },
    fieldInputMulti: { height: 100, paddingTop: 14 },
    bannerUpload: {
      width: "100%",
      height: 120,
      borderRadius: radii.xl,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    avatarUpload: {
      width: 72,
      height: 72,
      borderRadius: radii.xl,
      borderWidth: 4,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
      marginTop: -36,
      marginLeft: 16,
    },
    camOverlay: {
      position: "absolute",
      backgroundColor: "rgba(0,0,0,0.55)",
      padding: 5,
      borderRadius: 20,
    },
    categoryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    catChip: {
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderRadius: radii.full,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.bg.elevated,
    },
    catChipActive: {
      borderColor: c.primary,
      backgroundColor: "rgba(124,58,237,0.1)",
    },
    catChipText: {
      fontSize: fontSizes.sm,
      color: c.text.muted,
      fontWeight: "600",
    },
    catChipTextActive: { color: c.primaryLight, fontWeight: "700" },
    privacyRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      backgroundColor: c.bg.elevated,
      borderRadius: radii.md,
      padding: 16,
      borderWidth: 1,
      borderColor: c.border,
    },
    privacyLeft: {
      flex: 1,
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 14,
    },
    privacyLabel: {
      fontSize: fontSizes.md,
      fontWeight: "700",
      color: c.text.primary,
    },
    privacyDesc: {
      fontSize: fontSizes.xs,
      color: c.text.muted,
      marginTop: 4,
      lineHeight: 18,
    },
    toggle: {
      width: 48,
      height: 26,
      borderRadius: 13,
      backgroundColor: c.borderHover,
      justifyContent: "center",
      paddingHorizontal: 2,
    },
    toggleOn: { backgroundColor: c.primary },
    toggleThumb: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: "#fff",
    },
    toggleThumbOn: { alignSelf: "flex-end" },
  });
}

export default function CommunityScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const { isDark } = useTheme();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const { user: authUser } = useAuth();

  const {
    data: communitiesData,
    refetch,
    isRefetching,
    fetchNextPage,
    hasNextPage,
  } = useCommunities();
  const communities = communitiesData?.pages.flat() || [];

  const { mutate: toggleJoin } = useJoinCommunity();
  const { mutateAsync: createCommunityAsync } = useCreateCommunity();

  const [activeCategory, setActiveCategory] = useState("All");
  const [showCreate, setShowCreate] = useState(false);

  // Derived Data
  const joinedCommunities = useMemo(
    () =>
      communities.filter(
        (c: any) => (c.isMember || c.isJoined) && c.ownerId !== authUser?.id,
      ),
    [communities, authUser?.id],
  );

  const createdCommunities = useMemo(
    () => communities.filter((c: any) => c.ownerId === authUser?.id),
    [communities, authUser?.id],
  );

  const discoverCommunities = useMemo(
    () =>
      communities.filter(
        (c: any) => c.ownerId !== authUser?.id && !c.isJoined && !c.isMember,
      ),
    [communities, authUser?.id],
  );

  const trendingCommunities = useMemo(() => {
    return communities
      .filter((c: any) => c.ownerId !== authUser?.id)
      .sort(
        (a: any, b: any) =>
          b.memberCount * 10 + b.postCount - (a.memberCount * 10 + a.postCount),
      )
      .slice(0, 5);
  }, [communities, authUser?.id]);

  const filteredCommunities = useMemo(() => {
    if (activeCategory === "All") return communities;
    if (activeCategory === "Joined") return joinedCommunities; // Actually we probably want both created and joined if they select "Joined" or keep it separated? Let's just return both for "Joined" tab.
    if (activeCategory === "Created") return createdCommunities;
    return communities.filter((c) => c.category?.includes(activeCategory));
  }, [communities, activeCategory, joinedCommunities, createdCommunities]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar style={isDark ? "light" : "dark"} />

      <MainHeader />

      <View style={styles.header}>
        <View>
          <Text style={[styles.heroTitle, { fontSize: 20 }]}>Communities</Text>
          <Text style={styles.subtitle}>Find your tribe.</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <TouchableOpacity
            onPress={() =>
              navigation.navigate("Leaderboards", { initialTab: "Community" })
            }
          >
            <Ionicons
              name="trophy-outline"
              size={22}
              color={colors.text.secondary}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.createBtnWrap}
            onPress={() => setShowCreate(true)}
          >
            <LinearGradient
              colors={[colors.primary, colors.cyanDark]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.createBtn}
            >
              <Ionicons name="add-circle" size={18} color="#fff" />
              <Text style={styles.createBtnText}>Create</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.chipsWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {CATEGORY_TABS.map((cat) => (
            <TouchableOpacity
              key={cat.key}
              style={[
                styles.chip,
                activeCategory === cat.key && styles.chipActive,
              ]}
              onPress={() => setActiveCategory(cat.key)}
            >
              <Ionicons
                name={cat.icon as any}
                size={14}
                color={
                  activeCategory === cat.key
                    ? colors.primaryLight
                    : colors.text.muted
                }
                style={{ marginRight: 4 }}
              />
              <Text
                style={[
                  styles.chipText,
                  activeCategory === cat.key && styles.chipTextActive,
                ]}
              >
                {cat.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={colors.primary}
          />
        }
        onScroll={({ nativeEvent }) => {
          if (isCloseToBottom(nativeEvent) && hasNextPage) {
            fetchNextPage();
          }
        }}
        scrollEventThrottle={400}
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        {/* Render ALL View */}
        {activeCategory === "All" ? (
          <>
            {trendingCommunities.length > 0 && (
              <View>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionLabel}>Trending</Text>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  snapToInterval={CARD_WIDTH + spacing.xl}
                  decelerationRate="fast"
                >
                  {trendingCommunities.map((c, i) => (
                    <View
                      key={c.id}
                      style={
                        i === trendingCommunities.length - 1
                          ? { paddingRight: spacing.xl }
                          : {}
                      }
                    >
                      <FeaturedCommunityCard
                        community={c}
                        styles={styles}
                        onPress={() =>
                          navigation.navigate("CommunityDetail", {
                            communitySlug: c.slug,
                          })
                        }
                        onToggleJoin={(id, isCurrentlyMember) =>
                          toggleJoin({ communityId: id, isCurrentlyMember })
                        }
                      />
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}

            {createdCommunities.length > 0 && (
              <View>
                <View style={[styles.sectionHeaderRow, { marginTop: 32 }]}>
                  <Text style={styles.sectionLabel}>Created by You</Text>
                  <TouchableOpacity
                    onPress={() => setActiveCategory("Created")}
                    style={{ flexDirection: "row", alignItems: "center" }}
                  >
                    <Text style={styles.sectionAction}>See all </Text>
                    <Ionicons
                      name="arrow-forward"
                      size={12}
                      color={colors.primaryLight}
                    />
                  </TouchableOpacity>
                </View>
                {createdCommunities.slice(0, 3).map((c) => (
                  <CompactCommunityCard
                    key={c.id}
                    community={c}
                    styles={styles}
                    colors={colors}
                    onPress={() =>
                      navigation.navigate("CommunityDetail", {
                        communitySlug: c.slug,
                      })
                    }
                    onToggleJoin={(id, isCurrentlyMember) =>
                      toggleJoin({ communityId: id, isCurrentlyMember })
                    }
                    isOwner={true}
                  />
                ))}
              </View>
            )}

            {joinedCommunities.length > 0 && (
              <View>
                <View style={[styles.sectionHeaderRow, { marginTop: 32 }]}>
                  <Text style={styles.sectionLabel}>✅ Your Communities</Text>
                  <TouchableOpacity
                    onPress={() => setActiveCategory("Joined")}
                    style={{ flexDirection: "row", alignItems: "center" }}
                  >
                    <Text style={styles.sectionAction}>See all </Text>
                    <Ionicons
                      name="arrow-forward"
                      size={12}
                      color={colors.primaryLight}
                    />
                  </TouchableOpacity>
                </View>
                {joinedCommunities.slice(0, 3).map((c) => (
                  <CompactCommunityCard
                    key={c.id}
                    community={c}
                    styles={styles}
                    colors={colors}
                    onPress={() =>
                      navigation.navigate("CommunityDetail", {
                        communitySlug: c.slug,
                      })
                    }
                    onToggleJoin={(id, isCurrentlyMember) =>
                      toggleJoin({ communityId: id, isCurrentlyMember })
                    }
                    isOwner={false}
                  />
                ))}
              </View>
            )}

            {discoverCommunities.length > 0 && (
              <>
                <View style={[styles.sectionHeaderRow, { marginTop: 32 }]}>
                  <Text style={styles.sectionLabel}>Discover</Text>
                </View>
                {discoverCommunities.slice(0, 10).map((c: any) => (
                  <CompactCommunityCard
                    key={c.id}
                    community={c}
                    styles={styles}
                    colors={colors}
                    onPress={() =>
                      navigation.navigate("CommunityDetail", {
                        communitySlug: c.slug,
                      })
                    }
                    onToggleJoin={(id, isCurrentlyMember) =>
                      toggleJoin({ communityId: id, isCurrentlyMember })
                    }
                  />
                ))}
              </>
            )}
          </>
        ) : (
          /* Render Filtered View */
          <>
            <View style={[styles.sectionHeaderRow, { marginTop: 24 }]}>
              <Text style={styles.sectionLabel}>
                {activeCategory === "Joined"
                  ? "Your Communities"
                  : activeCategory === "Created"
                    ? "Created by You"
                    : `${activeCategory} Communities`}
              </Text>
              <Text style={styles.sectionAction}>
                {filteredCommunities.length} results
              </Text>
            </View>

            {filteredCommunities.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons
                  name={
                    activeCategory === "Joined"
                      ? "people-outline"
                      : "search-outline"
                  }
                  size={56}
                  color={colors.text.muted}
                  style={{ marginBottom: 16 }}
                />
                <Text style={styles.emptyTitle}>Nothing here yet</Text>
                <Text style={styles.emptyDesc}>
                  {activeCategory === "Joined"
                    ? "You haven't joined any communities. Explore and find your vibe!"
                    : `We couldn't find any communities for ${activeCategory}. Be the first to create one!`}
                </Text>
                {activeCategory === "Joined" ? (
                  <TouchableOpacity
                    style={styles.emptyBtn}
                    onPress={() => setActiveCategory("All")}
                  >
                    <Text style={styles.emptyBtnText}>Explore All</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.emptyBtn}
                    onPress={() => setShowCreate(true)}
                  >
                    <Text style={styles.emptyBtnText}>Create Community</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              filteredCommunities.map((c) => (
                <CompactCommunityCard
                  key={c.id}
                  community={c}
                  styles={styles}
                  colors={colors}
                  onPress={() =>
                    navigation.navigate("CommunityDetail", {
                      communitySlug: c.slug,
                    })
                  }
                  onToggleJoin={(id, isCurrentlyMember) =>
                    toggleJoin({ communityId: id, isCurrentlyMember })
                  }
                />
              ))
            )}
          </>
        )}
      </ScrollView>

      <CreateCommunityModal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        onCreate={(formData) => createCommunityAsync(formData)}
        styles={styles}
        colors={colors}
      />
    </View>
  );
}

// ─── Featured Community Card (Horizontal Scroll) ─────────────────────────────
function FeaturedCommunityCard({
  community: c,
  onPress,
  onToggleJoin,
  styles,
}: {
  community: Community;
  onPress: () => void;
  onToggleJoin: (communityId: string, isCurrentlyMember: boolean) => void;
  styles: ReturnType<typeof makeStyles>;
}) {
  const gradient = BANNER_COLORS[c.category?.[0]] ?? BANNER_COLORS.All;
  const avGrad = AVATAR_COLORS[c.category?.[0]] ?? AVATAR_COLORS.All;
  const isJoined = c.isMember || c.isJoined;

  return (
    <TouchableOpacity
      style={styles.featCard}
      onPress={onPress}
      activeOpacity={0.9}
    >
      <LinearGradient colors={gradient} style={styles.featBanner}>
        {c.bannerUrl ? (
          <Image
            source={{ uri: c.bannerUrl }}
            style={StyleSheet.absoluteFillObject}
          />
        ) : (
          <Text style={{ fontSize: 36, opacity: 0.8 }}>
            {c.bannerMediaId || "🔥"}
          </Text>
        )}
        <View style={styles.featOverlay}>
          {c.privacy === "private" && (
            <View style={styles.privateBadge}>
              <Ionicons name="lock-closed" size={10} color="#fff" />
              <Text style={styles.privateBadgeText}>Private</Text>
            </View>
          )}
        </View>
      </LinearGradient>

      <View style={styles.featBody}>
        <LinearGradient colors={avGrad} style={styles.featAvatarWrap}>
          {c.avatarUrl ? (
            <Image
              source={{ uri: c.avatarUrl }}
              style={{ width: "100%", height: "100%" }}
            />
          ) : (
            <Ionicons
              name="people-outline"
              size={28}
              color="rgba(255,255,255,0.5)"
            />
          )}
        </LinearGradient>

        <Text style={styles.featName} numberOfLines={1}>
          {c.name}
        </Text>
        <Text style={styles.featDesc} numberOfLines={2}>
          {c.description}
        </Text>

        <View style={styles.featFoot}>
          <View style={styles.featStats}>
            <View style={styles.featStat}>
              <Ionicons name="people" size={14} color="#64748b" />
              <Text style={styles.featStatText}>{c.memberCount}</Text>
            </View>
            <View style={styles.featStat}>
              <Ionicons name="chatbubbles" size={14} color="#64748b" />
              <Text style={styles.featStatText}>{c.postCount}</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.joinBtn, isJoined && styles.joinBtnJoined]}
            onPress={() => onToggleJoin(c.id, isJoined || false)}
          >
            <Text
              style={[styles.joinBtnText, isJoined && styles.joinBtnTextJoined]}
            >
              {isJoined
                ? "Leave"
                : c.privacy === "private"
                  ? "Request to Join"
                  : "Join"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Compact Community Card (Vertical List) ──────────────────────────────────
function CompactCommunityCard({
  community: c,
  onPress,
  onToggleJoin,
  styles,
  colors,
  isOwner,
}: {
  community: Community;
  onPress: () => void;
  onToggleJoin: (communityId: string, isCurrentlyMember: boolean) => void;
  styles: ReturnType<typeof makeStyles>;
  colors: ColorPalette;
  isOwner?: boolean;
}) {
  const isJoined = c.isMember || c.isJoined;
  const avGrad = AVATAR_COLORS[c.category?.[0]] ?? AVATAR_COLORS.All;

  // We should pass "isOwner" to determine if it says "Delete" or "Leave/Join".
  // But wait, the card just has a "Join" button. For owners, we shouldn't show Join/Leave on this screen maybe?
  // Wait, let's keep it simple: if owner, hide the Join button here or change it to "Settings".
  // Actually, we can just say "Manage" instead of "Joined".

  return (
    <TouchableOpacity
      style={styles.compCard}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <LinearGradient colors={avGrad} style={styles.compAvatarWrap}>
        {c.avatarUrl ? (
          <Image
            source={{ uri: c.avatarUrl }}
            style={{ width: "100%", height: "100%" }}
          />
        ) : (
          <Ionicons
            name="people-outline"
            size={24}
            color="rgba(255,255,255,0.5)"
          />
        )}
      </LinearGradient>

      <View style={styles.compInfo}>
        <Text style={styles.compName} numberOfLines={1}>
          {c.name}{" "}
          {c.privacy === "private" && (
            <Ionicons name="lock-closed" size={12} color={colors.text.muted} />
          )}
        </Text>
        <Text style={styles.compStats}>
          {c.memberCount} members • {c.postCount} posts
        </Text>
      </View>

      {isOwner ? (
        <TouchableOpacity
          style={[styles.joinBtn, styles.joinBtnJoined]}
          onPress={(e) => {
            e.stopPropagation();
            onPress(); // Or navigate to settings
          }}
        >
          <Text style={[styles.joinBtnText, styles.joinBtnTextJoined]}>
            Manage
          </Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={[styles.joinBtn, isJoined && styles.joinBtnJoined]}
          onPress={(e) => {
            e.stopPropagation();
            onToggleJoin(c.id, isJoined || false);
          }}
        >
          <Text
            style={[styles.joinBtnText, isJoined && styles.joinBtnTextJoined]}
          >
            {isJoined
              ? "Leave"
              : c.privacy === "private"
                ? "Request to Join"
                : "Join"}
          </Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

// ─── Create Community Modal ──────────────────────────────────────────────────
const COMMUNITY_CATEGORIES = [
  "Tech",
  "Gaming",
  "Lifestyle",
  "Startup",
  "Creative",
  "Study",
];
const EMOJI_OPTIONS = [
  "🚀",
  "⚡",
  "🎮",
  "🎨",
  "🔥",
  "🌟",
  "💡",
  "🏆",
  "🎓",
  "🦄",
  "🌐",
  "⚙️",
  "🎯",
  "🧠",
  "🌍",
  "🎵",
];

function CreateCommunityModal({
  visible,
  onClose,
  onCreate,
  styles,
  colors,
}: {
  visible: boolean;
  onClose: () => void;
  onCreate: (c: any) => void;
  styles: ReturnType<typeof makeStyles>;
  colors: ColorPalette;
}) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [category, setCategory] = useState("Tech");
  const [isPrivate, setIsPrivate] = useState(false);
  const [avatarAsset, setAvatarAsset] =
    useState<ImagePicker.ImagePickerAsset | null>(null);
  const [bannerAsset, setBannerAsset] =
    useState<ImagePicker.ImagePickerAsset | null>(null);
  const [creating, setCreating] = useState(false);

  const reset = () => {
    setName("");
    setDesc("");
    setCategory("Tech");
    setIsPrivate(false);
    setAvatarAsset(null);
    setBannerAsset(null);
  };

  const pickImage = async (type: "avatar" | "banner") => {
    appLockBypass.beginNativeFlow();
    try {
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission needed", "Allow access to your media library.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: type === "avatar" ? [1, 1] : [3, 1],
        quality: 0.85,
      });
      if (!result.canceled && result.assets.length > 0) {
        if (type === "avatar") setAvatarAsset(result.assets[0]);
        else setBannerAsset(result.assets[0]);
      }
    } finally {
      appLockBypass.endNativeFlow();
    }
  };

  const uploadMedia = async (
    asset: ImagePicker.ImagePickerAsset,
    type: "avatar" | "banner",
  ) => {
    const mimeType = asset.mimeType || "image/jpeg";
    let fileSize = asset.fileSize;
    if (!fileSize) {
      const info = await FileSystem.getInfoAsync(asset.uri);
      fileSize = info.exists && "size" in info ? info.size : 1000000;
    }
    const res = await mediaService.getSignedUrl(
      type === "avatar" ? "avatars" : "banners",
      fileSize,
      mimeType,
      asset.width,
      asset.height,
    );
    await mediaService.uploadFileDirect(
      res.data.signedUrl!,
      asset.uri,
      mimeType,
    );
    await mediaService.confirmUpload(res.data.mediaId, res.data.s3Key!);
    return res.data.mediaId;
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert("Name required", "Please enter a community name.");
      return;
    }
    if (!desc.trim()) {
      Alert.alert("Description required", "Please add a short description.");
      return;
    }
    setCreating(true);
    try {
      const payload: any = {
        name: name.trim(),
        description: desc.trim(),
        privacy: isPrivate ? "private" : "public",
        category: [category],
      };
      if (avatarAsset)
        payload.avatarMediaId = await uploadMedia(avatarAsset, "avatar");
      if (bannerAsset)
        payload.bannerMediaId = await uploadMedia(bannerAsset, "banner");
      onCreate(payload);
      reset();
      onClose();
    } catch (e: any) {
      Alert.alert(
        "Error",
        e.response?.data?.message || "Failed to create community.",
      );
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => {
        reset();
        onClose();
      }}
    >
      <KeyboardAvoidingView
        style={[styles.modalContainer, { paddingTop: insets.top || 16 }]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={8}
      >
        <View style={styles.modalHeader}>
          <TouchableOpacity
            onPress={() => {
              reset();
              onClose();
            }}
            disabled={creating}
          >
            <Ionicons name="close" size={24} color={colors.text.secondary} />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>Create Community</Text>
          <TouchableOpacity onPress={handleCreate} disabled={creating}>
            {creating ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text
                style={{
                  fontSize: fontSizes.md,
                  fontWeight: "700",
                  color: colors.primary,
                }}
              >
                Create
              </Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.modalContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Banner + Avatar Uploaders */}
          <View>
            <TouchableOpacity
              style={[
                styles.bannerUpload,
                {
                  backgroundColor: colors.bg.elevated,
                  borderColor: colors.border,
                },
              ]}
              onPress={() => pickImage("banner")}
            >
              {bannerAsset ? (
                <Image
                  source={{ uri: bannerAsset.uri }}
                  style={StyleSheet.absoluteFillObject}
                />
              ) : (
                <View style={{ alignItems: "center", gap: 6 }}>
                  <Ionicons
                    name="image-outline"
                    size={28}
                    color={colors.text.muted}
                  />
                  <Text
                    style={{ fontSize: fontSizes.xs, color: colors.text.muted }}
                  >
                    Tap to add banner
                  </Text>
                </View>
              )}
              <View style={styles.camOverlay}>
                <Ionicons name="camera" size={14} color="#fff" />
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.avatarUpload,
                {
                  backgroundColor: colors.bg.card,
                  borderColor: colors.bg.base,
                },
              ]}
              onPress={() => pickImage("avatar")}
            >
              {avatarAsset ? (
                <Image
                  source={{ uri: avatarAsset.uri }}
                  style={{ width: "100%", height: "100%" }}
                />
              ) : (
                <Ionicons
                  name="people-outline"
                  size={28}
                  color={colors.text.muted}
                />
              )}
              <View style={[styles.camOverlay, { borderRadius: 12 }]}>
                <Ionicons name="camera" size={12} color="#fff" />
              </View>
            </TouchableOpacity>
          </View>

          <Text style={styles.fieldLabel}>
            Name <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={styles.fieldInput}
            placeholder="e.g. Campus Coders"
            placeholderTextColor={colors.text.muted}
            value={name}
            onChangeText={setName}
            maxLength={40}
          />

          <Text style={styles.fieldLabel}>
            Description <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={[styles.fieldInput, styles.fieldInputMulti]}
            placeholder="What is this community about?"
            placeholderTextColor={colors.text.muted}
            multiline
            value={desc}
            onChangeText={setDesc}
            maxLength={200}
            textAlignVertical="top"
          />

          <Text style={styles.fieldLabel}>Category</Text>
          <View style={styles.categoryGrid}>
            {COMMUNITY_CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[
                  styles.catChip,
                  category === cat && styles.catChipActive,
                ]}
                onPress={() => setCategory(cat)}
              >
                <Text
                  style={[
                    styles.catChipText,
                    category === cat && styles.catChipTextActive,
                  ]}
                >
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={styles.privacyRow}
            onPress={() => setIsPrivate((v) => !v)}
            activeOpacity={0.8}
          >
            <View style={styles.privacyLeft}>
              <Ionicons
                name={isPrivate ? "lock-closed" : "globe-outline"}
                size={22}
                color={isPrivate ? colors.primary : colors.text.muted}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.privacyLabel}>
                  {isPrivate ? "Private Community" : "Public Community"}
                </Text>
                <Text style={styles.privacyDesc}>
                  {isPrivate
                    ? "Only approved members can join and post."
                    : "Anyone can find and join this community."}
                </Text>
              </View>
            </View>
            <View style={[styles.toggle, isPrivate && styles.toggleOn]}>
              <View
                style={[styles.toggleThumb, isPrivate && styles.toggleThumbOn]}
              />
            </View>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
