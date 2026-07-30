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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { fontSizes, spacing, radii, type ColorPalette } from "../../theme";
import { useTheme, useThemeColors } from "../../context/ThemeContext";
import { useCommunities } from "../../queries/communities";
import { useJoinCommunity, useCreateCommunity } from "../../mutations/communities";
import type { Community, CommunityStackParamList } from "../../types";
import MainHeader from "../../components/common/MainHeader";

type Nav = NativeStackNavigationProp<CommunityStackParamList, "CommunityList">;

const isCloseToBottom = ({ layoutMeasurement, contentOffset, contentSize }: any) => {
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
  { label: "🔥 All", key: "All" },
  { label: "✅ Joined", key: "Joined" },
  { label: "💻 Tech", key: "Tech" },
  { label: "🎮 Gaming", key: "Gaming" },
  { label: "🎓 Lifestyle", key: "Lifestyle" },
  { label: "🚀 Startups", key: "Startup" },
  { label: "🎨 Creative", key: "Creative" },
  { label: "📚 Study", key: "Study" },
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

    chipsWrap: { backgroundColor: c.bg.base, paddingVertical: 12 },
    chips: { paddingHorizontal: spacing.xl, gap: 10 },
    chip: {
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderRadius: radii.full,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.bg.elevated,
    },
    chipActive: {
      borderColor: c.primary,
      backgroundColor: "rgba(124,58,237,0.1)",
    },
    chipText: {
      fontSize: fontSizes.sm,
      color: c.text.muted,
      fontWeight: "600",
    },
    chipTextActive: { color: c.primaryLight, fontWeight: "700" },

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
      borderRadius: radii.xl,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: c.borderHover,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.15,
      shadowRadius: 12,
      elevation: 6,
    },
    featBanner: { height: 100, justifyContent: "center", alignItems: "center" },
    featOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(0,0,0,0.3)",
      justifyContent: "flex-start",
      alignItems: "flex-end",
      padding: 12,
    },
    featBody: { padding: 16, paddingTop: 0 },
    featAvatarWrap: {
      width: 64,
      height: 64,
      borderRadius: radii.md,
      borderWidth: 4,
      borderColor: c.bg.card,
      marginTop: -32,
      marginBottom: 12,
      overflow: "hidden",
      backgroundColor: c.bg.elevated,
      alignItems: "center",
      justifyContent: "center",
    },
    featName: {
      fontSize: fontSizes.lg,
      fontWeight: "800",
      color: c.text.primary,
      marginBottom: 4,
    },
    featDesc: {
      fontSize: fontSizes.xs,
      color: c.text.secondary,
      lineHeight: 18,
      height: 36,
      marginBottom: 16,
    },
    featFoot: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderTopWidth: 1,
      borderTopColor: c.border,
      paddingTop: 12,
    },
    featStats: { flexDirection: "row", alignItems: "center", gap: 12 },
    featStat: { flexDirection: "row", alignItems: "center", gap: 4 },
    featStatText: {
      fontSize: fontSizes.xs,
      color: c.text.muted,
      fontWeight: "600",
    },

    /* Compact Vertical Card */
    compCard: {
      flexDirection: "row",
      alignItems: "center",
      marginHorizontal: spacing.xl,
      marginBottom: 16,
      backgroundColor: c.bg.card,
      borderRadius: radii.lg,
      padding: 12,
      borderWidth: 1,
      borderColor: c.border,
    },
    compAvatarWrap: {
      width: 56,
      height: 56,
      borderRadius: radii.md,
      overflow: "hidden",
      backgroundColor: c.bg.elevated,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 16,
    },
    compInfo: { flex: 1, justifyContent: "center" },
    compName: {
      fontSize: fontSizes.md,
      fontWeight: "800",
      color: c.text.primary,
      marginBottom: 4,
    },
    compStats: {
      fontSize: fontSizes.xs,
      color: c.text.muted,
      fontWeight: "500",
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
    emojiRow: { gap: 12, paddingBottom: 4 },
    emojiOption: {
      width: 56,
      height: 56,
      borderRadius: radii.lg,
      backgroundColor: c.bg.elevated,
      borderWidth: 2,
      borderColor: "transparent",
      alignItems: "center",
      justifyContent: "center",
    },
    emojiOptionActive: {
      borderColor: c.primaryLight,
      backgroundColor: "rgba(124,58,237,0.1)",
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
  
  const { data: communitiesData, refetch, isRefetching, fetchNextPage, hasNextPage } = useCommunities();
  const communities = communitiesData?.pages.flat() || [];
  
  const { mutate: toggleJoin } = useJoinCommunity();
  const { mutateAsync: createCommunityAsync } = useCreateCommunity();

  const [activeCategory, setActiveCategory] = useState("All");
  const [showCreate, setShowCreate] = useState(false);

  // Derived Data
  const joinedCommunities = useMemo(
    () => communities.filter((c: any) => c.isMember || c.isJoined),
    [communities],
  );

  const trendingCommunities = useMemo(() => {
    return [...communities]
      .sort(
        (a, b) =>
          b.memberCount * 10 + b.postCount - (a.memberCount * 10 + a.postCount),
      )
      .slice(0, 5);
  }, [communities]);

  const filteredCommunities = useMemo(() => {
    if (activeCategory === "All") return communities;
    if (activeCategory === "Joined") return joinedCommunities;
    return communities.filter((c) => c.category?.includes(activeCategory));
  }, [communities, activeCategory, joinedCommunities]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar style={isDark ? "light" : "dark"} />

      <MainHeader />

      <View style={styles.header}>
        <View>
          <Text style={[styles.heroTitle, { fontSize: 20 }]}>Communities</Text>
          <Text style={styles.subtitle}>Find your tribe.</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <TouchableOpacity onPress={() => navigation.navigate('Leaderboards', { initialTab: 'Community' })}>
            <Ionicons name="trophy-outline" size={22} color={colors.text.secondary} />
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
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />
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
                  <Text style={styles.sectionLabel}>🔥 Trending</Text>
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
                        onToggleJoin={(id, isCurrentlyMember) => toggleJoin({ communityId: id, isCurrentlyMember })}
                      />
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}

            {joinedCommunities.length > 0 && (
              <View>
                <View style={[styles.sectionHeaderRow, { marginTop: 32 }]}>
                  <Text style={styles.sectionLabel}>✅ Your Communities</Text>
                  <TouchableOpacity onPress={() => setActiveCategory("Joined")}>
                    <Text style={styles.sectionAction}>See All</Text>
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
                    onToggleJoin={(id, isCurrentlyMember) => toggleJoin({ communityId: id, isCurrentlyMember })}
                  />
                ))}
              </View>
            )}

            <View style={[styles.sectionHeaderRow, { marginTop: 32 }]}>
              <Text style={styles.sectionLabel}>🌐 Discover</Text>
            </View>
            {communities.slice(0, 10).map((c) => (
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
                onToggleJoin={(id, isCurrentlyMember) => toggleJoin({ communityId: id, isCurrentlyMember })}
              />
            ))}
          </>
        ) : (
          /* Render Filtered View */
          <>
            <View style={[styles.sectionHeaderRow, { marginTop: 24 }]}>
              <Text style={styles.sectionLabel}>
                {activeCategory === "Joined"
                  ? "Your Communities"
                  : `${activeCategory} Communities`}
              </Text>
              <Text style={styles.sectionAction}>
                {filteredCommunities.length} results
              </Text>
            </View>

            {filteredCommunities.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyEmoji}>
                  {activeCategory === "Joined" ? "👥" : "🔍"}
                </Text>
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
                  onToggleJoin={(id, isCurrentlyMember) => toggleJoin({ communityId: id, isCurrentlyMember })}
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
            <Text style={{ fontSize: 28 }}>{c.avatarMediaId || "👾"}</Text>
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
              style={[
                styles.joinBtnText,
                isJoined && styles.joinBtnTextJoined,
              ]}
            >
              {isJoined ? "Joined" : "Join"}
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
}: {
  community: Community;
  onPress: () => void;
  onToggleJoin: (communityId: string, isCurrentlyMember: boolean) => void;
  styles: ReturnType<typeof makeStyles>;
  colors: ColorPalette;
}) {
  const isJoined = c.isMember || c.isJoined;
  const avGrad = AVATAR_COLORS[c.category?.[0]] ?? AVATAR_COLORS.All;

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
          <Text style={{ fontSize: 24 }}>{c.avatarMediaId || "👾"}</Text>
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
          {isJoined ? "Joined" : "Join"}
        </Text>
      </TouchableOpacity>
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
  const [avatar, setAvatar] = useState("🚀");
  const [isPrivate, setIsPrivate] = useState(false);

  const reset = () => {
    setName("");
    setDesc("");
    setCategory("Tech");
    setAvatar("🚀");
    setIsPrivate(false);
  };

  const handleCreate = () => {
    if (!name.trim()) {
      Alert.alert("Name required", "Please enter a community name.");
      return;
    }
    if (!desc.trim()) {
      Alert.alert("Description required", "Please add a short description.");
      return;
    }
    const newComm = {
      name: name.trim(),
      description: desc.trim(),
      privacy: isPrivate ? "private" : "public",
      category: [category],
    };
    onCreate(newComm);
    reset();
    onClose();
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
          >
            <Ionicons name="close" size={24} color={colors.text.secondary} />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>Create Community</Text>
          <TouchableOpacity onPress={handleCreate}>
            <Text
              style={{
                fontSize: fontSizes.md,
                fontWeight: "700",
                color: colors.primary,
              }}
            >
              Create
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.modalContent}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.fieldLabel}>Icon</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.emojiRow}
          >
            {EMOJI_OPTIONS.map((em) => (
              <TouchableOpacity
                key={em}
                style={[
                  styles.emojiOption,
                  avatar === em && styles.emojiOptionActive,
                ]}
                onPress={() => setAvatar(em)}
              >
                <Text style={{ fontSize: 24 }}>{em}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

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
                    ? "Only approved members can join and post. Posts are hidden from non-members."
                    : "Anyone can find and join this community. Posts are visible to everyone."}
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
