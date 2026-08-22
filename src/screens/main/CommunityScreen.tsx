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

  Image,
  Dimensions,
  Platform,
  DeviceEventEmitter,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { fontSizes, spacing, radii, type ColorPalette } from "../../theme";
import { useTheme, useThemeColors } from "../../context/ThemeContext";
import PullToRefreshWrapper from '../../components/common/PullToRefreshWrapper';
import StateBlock from '../../components/common/StateBlock';
import { useAuth } from "../../context/AuthContext";
import { useCommunities, useCommunityCategories } from "../../queries/communities";
import {
  useJoinCommunity,
  useCreateCommunity,
} from "../../mutations/communities";
import type { Community, CommunityStackParamList } from "../../types";
import MainHeader from "../../components/common/MainHeader";
import { SectionHeader } from "../../components/common/SectionChrome";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import { mediaService } from "../../services/media.service";
import { nativeBypass } from "../../utils/nativeBypass";
import { themedAlert } from '../../components/common/ThemedAlert';
import SmartInput from "../../components/common/SmartInput";
import BioText from "../../components/common/BioText";

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

const DYNAMIC_ICONS: Record<string, string> = {
  Tech: "laptop-outline",
  Gaming: "game-controller-outline",
  Lifestyle: "cafe-outline",
  Startup: "rocket-outline",
  Creative: "color-palette-outline",
  Study: "book-outline",
  Others: "ellipsis-horizontal-outline",
};

const HARDCODED_TABS = [
  { label: "All", key: "All", icon: "grid-outline" },
  { label: "Created", key: "Created", icon: "star-outline" },
  { label: "Joined", key: "Joined", icon: "checkmark-circle-outline" },
];

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg.base },

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

    /* Featured Horizontal Card */
    featCard: {
      width: CARD_WIDTH,
      marginLeft: spacing.xl,
      backgroundColor: c.bg.card,
      borderRadius: radii.xl || 24,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: c.border,
      shadowColor: c.primary,
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.25,
      shadowRadius: 20,
      elevation: 8,
    },
    featBanner: { height: 100, justifyContent: "center", alignItems: "center" },
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
      borderTopColor: c.border,
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
      backgroundColor: c.bg.card,
      borderRadius: radii.xl || 20,
      padding: 16,
      borderWidth: 1,
      borderColor: c.border,
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
    nameHint: {
      fontSize: 11,
      color: "#64748B",
      marginTop: 4,
      marginBottom: 10,
    },
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
    privacyOptions: { flexDirection: "row", gap: 10 },
    privacyOption: {
      flex: 1,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radii.lg,
      backgroundColor: c.bg.elevated,
      padding: 14,
      gap: 6,
    },
    privacyOptionActive: {
      borderColor: c.primary,
      backgroundColor: "rgba(124,58,237,0.08)",
    },
    privacyOptionCheck: { position: "absolute", top: 10, right: 10 },
    privacyOptionIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(255,255,255,0.06)",
    },
    privacyOptionTitle: {
      fontSize: fontSizes.md,
      fontWeight: "800",
      color: c.text.primary,
      marginTop: 2,
    },
    privacyOptionDesc: {
      fontSize: fontSizes.xs,
      color: c.text.muted,
      lineHeight: 16,
    },
  });
}

export default function CommunityScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const { isDark } = useTheme();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const { user: authUser } = useAuth();

  const { data: categoriesData } = useCommunityCategories();
  const dynamicCategories = (categoriesData || []).map((cat: string) => ({
    label: cat,
    key: cat,
    icon: DYNAMIC_ICONS[cat] || "ellipsis-horizontal-outline",
  }));
  const ALL_CATEGORY_TABS = [...HARDCODED_TABS, ...dynamicCategories];

  const [activeCategory, setActiveCategory] = useState("All");
  const [showCreate, setShowCreate] = useState(false);

  const filter = activeCategory === 'Joined' ? 'joined' : activeCategory === 'Created' ? 'created' : undefined;
  const categoryParam = activeCategory !== 'All' && activeCategory !== 'Joined' && activeCategory !== 'Created' ? activeCategory : undefined;

  const {
    data: communitiesData,
    refetch,
    isRefetching,
    fetchNextPage,
    hasNextPage,
    isPending,
  } = useCommunities('', filter, categoryParam);
  const communities = communitiesData?.pages.flatMap((p: any) => p.items) || [];

  // The server owns the SECTION ORDER of the All tab (sections descriptor
  // rides on page 1). Unknown/newer section types are skipped; this fallback
  // keeps older servers working.
  const DEFAULT_SECTIONS = [
    { type: "trending", title: "Trending" },
    { type: "created", title: "Created by You" },
    { type: "joined", title: "Your Communities" },
    { type: "discover", title: "Discover" },
  ];
  const firstPage = (communitiesData?.pages?.[0] as any) || null;
  const sectionOrder: { type: string; title: string }[] =
    firstPage?.sections?.length > 0 ? firstPage.sections : DEFAULT_SECTIONS;

  const { mutate: toggleJoin } = useJoinCommunity();
  const { mutateAsync: createCommunityAsync } = useCreateCommunity();

  React.useEffect(() => {
    const sub = DeviceEventEmitter.addListener('openCreateCommunity', () => {
      setShowCreate(true);
    });
    return () => sub.remove();
  }, []);

  // Scroll offset is saved on every scroll and restored on refocus — the
  // list stays mounted, so re-entering the tab keeps your place instead of
  // resetting to the top.
  const communitiesScrollRef = React.useRef<any>(null);
  const communityScrollOffsetRef = React.useRef(0);

  // Re-fetch the ACTIVE pill's data whenever the tab regains focus (the
  // react-query cache was serving first-fetched data on re-entry). Debounced:
  // a blur during the 300ms window cancels the pending refetch, so rapid tab
  // switching doesn't fire one API call per hop.
  useFocusEffect(
    React.useCallback(() => {
      const t = setTimeout(() => {
        refetch();
        setTimeout(() => {
          communitiesScrollRef.current?.scrollTo({
            y: communityScrollOffsetRef.current,
            animated: false,
          });
        }, 80);
      }, 300);
      return () => clearTimeout(t);
    }, [refetch]),
  );

  // Tab-bar single-tap → scroll to top; double-tap → scroll to top + refresh
  // the active pill, dropping the pull bubble in like a real pull.
  React.useEffect(() => {
    const subs = [
      DeviceEventEmitter.addListener('communitySingleTap', () => {
        communitiesScrollRef.current?.scrollTo({ y: 0, animated: true });
      }),
      DeviceEventEmitter.addListener('communityDoubleTap', () => {
        communitiesScrollRef.current?.scrollTo({ y: 0, animated: true });
        DeviceEventEmitter.emit('triggerPullRefresh');
        setTimeout(() => refetch(), 500);
      }),
    ];
    return () => subs.forEach((s) => s.remove());
  }, [refetch]);

  // Derived Data for the "All" tab previews
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

  // For the non-All tabs, the communities array itself is already filtered by the backend!
  const filteredCommunities = communities;

  // ── All-tab sections — rendered in the server-provided order ─────────────
  const sectionHeader = (title: string, first: boolean, action?: { label: string; onPress: () => void }) => (
    <View style={[styles.sectionHeaderRow, !first && { marginTop: 32 }]}>
      <Text style={styles.sectionLabel}>{title}</Text>
      {action && (
        <TouchableOpacity
          onPress={action.onPress}
          style={{ flexDirection: "row", alignItems: "center" }}
        >
          <Text style={styles.sectionAction}>{action.label} </Text>
          <Ionicons name="arrow-forward" size={12} color={colors.primaryLight} />
        </TouchableOpacity>
      )}
    </View>
  );

  const renderAllSection = (s: { type: string; title: string }, first: boolean) => {
    switch (s.type) {
      case "trending":
        if (trendingCommunities.length === 0) return null;
        return (
          <View key="sect-trending">
            {sectionHeader(s.title, first)}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              snapToInterval={CARD_WIDTH + spacing.xl}
              decelerationRate="fast"
            >
              {trendingCommunities.map((c, i) => (
                <View
                  key={c.id}
                  style={i === trendingCommunities.length - 1 ? { paddingRight: spacing.xl } : {}}
                >
                  <FeaturedCommunityCard
                    community={c}
                    styles={styles}
                    onPress={() =>
                      navigation.navigate("CommunityDetail", { communitySlug: c.slug })
                    }
                    onToggleJoin={(id, isCurrentlyMember, isPending) =>
                      toggleJoin({ communityId: id, isCurrentlyMember, isPending })
                    }
                  />
                </View>
              ))}
            </ScrollView>
          </View>
        );
      case "created":
        if (createdCommunities.length === 0) return null;
        return (
          <View key="sect-created">
            {sectionHeader(s.title, first, { label: "See all", onPress: () => setActiveCategory("Created") })}
            {createdCommunities.slice(0, 3).map((c) => (
              <CompactCommunityCard
                key={c.id}
                community={c}
                styles={styles}
                colors={colors}
                onPress={() =>
                  navigation.navigate("CommunityDetail", { communitySlug: c.slug })
                }
                onToggleJoin={(id, isCurrentlyMember, isPending) =>
                  toggleJoin({ communityId: id, isCurrentlyMember, isPending })
                }
                isOwner={true}
              />
            ))}
          </View>
        );
      case "joined":
        if (joinedCommunities.length === 0) return null;
        return (
          <View key="sect-joined">
            {sectionHeader(s.title, first, { label: "See all", onPress: () => setActiveCategory("Joined") })}
            {joinedCommunities.slice(0, 3).map((c) => (
              <CompactCommunityCard
                key={c.id}
                community={c}
                styles={styles}
                colors={colors}
                onPress={() =>
                  navigation.navigate("CommunityDetail", { communitySlug: c.slug })
                }
                onToggleJoin={(id, isCurrentlyMember, isPending) =>
                  toggleJoin({ communityId: id, isCurrentlyMember, isPending })
                }
                isOwner={false}
              />
            ))}
          </View>
        );
      case "discover":
        if (discoverCommunities.length === 0) return null;
        return (
          <View key="sect-discover">
            {sectionHeader(s.title, first)}
            {discoverCommunities.map((c: any) => (
              <CompactCommunityCard
                key={c.id}
                community={c}
                styles={styles}
                colors={colors}
                onPress={() =>
                  navigation.navigate("CommunityDetail", { communitySlug: c.slug })
                }
                onToggleJoin={(id, isCurrentlyMember, isPending) =>
                  toggleJoin({ communityId: id, isCurrentlyMember, isPending })
                }
              />
            ))}
          </View>
        );
      default:
        // Unknown section type from a newer server — skip it rather than crash.
        return null;
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style={isDark ? "light" : "dark"} />

      <MainHeader />

      <PullToRefreshWrapper
        refreshing={isRefetching}
        onRefresh={refetch}
        sectionHeader={
          /* Pinned with the main header — title + category chips slide
              away with it for a full-screen feed, and ease back in together
              on scroll-up. Shared SectionHeader component. */
          <SectionHeader
            title="Communities"
            subtitle="Find your tribe."
            actions={[
              {
                icon: "trophy-outline",
                onPress: () =>
                  navigation.navigate("Leaderboards", { initialTab: "Community" }),
              },
            ]}
            pills={ALL_CATEGORY_TABS.map((cat) => ({
              key: cat.key,
              label: cat.label,
              icon: cat.icon as any,
              active: activeCategory === cat.key,
              onPress: () => setActiveCategory(cat.key),
            }))}
          />
        }
        sectionHeaderH={144}
      >
        <ScrollView
          ref={communitiesScrollRef}
          showsVerticalScrollIndicator={false}
        onScroll={({ nativeEvent }) => {
          communityScrollOffsetRef.current = nativeEvent.contentOffset.y;
          if (isCloseToBottom(nativeEvent) && hasNextPage) {
            fetchNextPage();
          }
        }}
        scrollEventThrottle={400}
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        {/* Render ALL View — sections in the SERVER-provided order. */}
        {isPending ? (
          <StateBlock loading />
        ) : activeCategory === "All" ? (
          <>
            {sectionOrder.map((s, idx) => renderAllSection(s, idx === 0))}
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
            </View>

            {filteredCommunities.length === 0 ? (
              <StateBlock
                icon={
                  activeCategory === "Joined" ? "people-outline" : "search-outline"
                }
                title="Nothing here yet"
                subtitle={
                  activeCategory === "Joined"
                    ? "You haven't joined any communities. Explore and find your vibe!"
                    : `We couldn't find any communities for ${activeCategory}. Be the first to create one!`
                }
                actionLabel={activeCategory === "Joined" ? "Explore All" : undefined}
                onAction={() => setActiveCategory("All")}
              />
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
                  onToggleJoin={(id, isCurrentlyMember, isPending) =>
                    toggleJoin({ communityId: id, isCurrentlyMember, isPending })
                  }
                  // Admins must never see a Leave/Join button on their own
                  // community — the Created tab would otherwise show Leave.
                  isOwner={c.ownerId === authUser?.id}
                />
              ))
            )}
          </>
        )}
        </ScrollView>
      </PullToRefreshWrapper>

      <CreateCommunityModal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        categories={(categoriesData || [])}
        onCreate={async (formData) => {
          const res = await createCommunityAsync(formData);
          const created = res?.data?.community || res?.data || res?.community;
          const slug = created?.slug || created?.id;
          // Jump straight into the freshly created community.
          if (slug) {
            navigation.navigate("CommunityDetail", { communitySlug: slug });
          }
        }}
        styles={styles}
        colors={colors}
      />
    </View>
  );
}

// ─── Featured Community Card (Horizontal Scroll) ─────────────────────────────
const FeaturedCommunityCard = React.memo(function FeaturedCommunityCard({
  community: c,
  onPress,
  onToggleJoin,
  styles,
}: {
  community: Community;
  onPress: () => void;
  onToggleJoin: (communityId: string, isCurrentlyMember: boolean, isPending?: boolean) => void;
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
            resizeMode="cover"
          />
        ) : null}
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
              resizeMode="cover"
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
          <BioText text={c.description || ""} style={undefined} />
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
            style={[
              styles.joinBtn,
              (isJoined || c.isPending) && styles.joinBtnJoined,
            ]}
            onPress={() => onToggleJoin(c.id, isJoined ?? false, c.isPending)}
          >
            <Text
              style={[
                styles.joinBtnText,
                (isJoined || c.isPending) && styles.joinBtnTextJoined,
              ]}
            >
              {isJoined
                ? "Leave"
                : c.isPending
                  ? "Requested ✓"
                  : c.privacy === "private"
                    ? "Request to Join"
                    : "Join"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
})

// ─── Compact Community Card (Vertical List) ──────────────────────────────────
const CompactCommunityCard = React.memo(function CompactCommunityCard({
  community: c,
  onPress,
  onToggleJoin,
  styles,
  colors,
  isOwner,
}: {
  community: Community;
  onPress: () => void;
  onToggleJoin: (communityId: string, isCurrentlyMember: boolean, isPending?: boolean) => void;
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
            resizeMode="cover"
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
          style={[
            styles.joinBtn,
            (isJoined || c.isPending) && styles.joinBtnJoined,
          ]}
          onPress={(e) => {
            e.stopPropagation();
            onToggleJoin(c.id, isJoined ?? false, c.isPending);
          }}
        >
          <Text
            style={[
              styles.joinBtnText,
              (isJoined || c.isPending) && styles.joinBtnTextJoined,
            ]}
          >
            {isJoined
              ? "Leave"
              : c.isPending
                ? "Requested ✓"
                : c.privacy === "private"
                  ? "Request to Join"
                  : "Join"}
          </Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
})

// ─── Create Community Modal ──────────────────────────────────────────────────
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

const CreateCommunityModal = React.memo(function CreateCommunityModal({
  visible,
  onClose,
  onCreate,
  categories,
  styles,
  colors,
}: {
  visible: boolean;
  onClose: () => void;
  onCreate: (c: any) => Promise<any> | void;
  categories: string[];
  styles: ReturnType<typeof makeStyles>;
  colors: ColorPalette;
}) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [category, setCategory] = useState(categories[0] || "");
  const [isPrivate, setIsPrivate] = useState(false);
  const [avatarAsset, setAvatarAsset] =
    useState<ImagePicker.ImagePickerAsset | null>(null);
  const [bannerAsset, setBannerAsset] =
    useState<ImagePicker.ImagePickerAsset | null>(null);
  const [creating, setCreating] = useState(false);

  const reset = () => {
    setName("");
    setDesc("");
    setCategory(categories[0] || "");
    setIsPrivate(false);
    setAvatarAsset(null);
    setBannerAsset(null);
  };

  const pickImage = async (type: "avatar" | "banner") => {
    nativeBypass.beginNativeFlow();
    try {
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        themedAlert("Permission needed", "Allow access to your media library.");
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
      nativeBypass.endNativeFlow();
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
    const cleanName = name.trim();
    if (!cleanName) {
      themedAlert("Name required", "Please enter a community name.");
      return;
    }
    if (/[^a-zA-Z0-9_]/.test(cleanName)) {
      themedAlert(
        "Invalid name",
        "Community names can only contain letters, numbers and underscores (no spaces or hyphens).",
      );
      return;
    }
    if (!desc.trim()) {
      themedAlert("Description required", "Please add a short description.");
      return;
    }
    setCreating(true);
    try {
      const payload: any = {
        name: cleanName,
        description: desc.trim(),
        privacy: isPrivate ? "private" : "public",
        category: [category],
      };
      // Track uploads so a failure AFTER an upload (e.g. the second asset or
      // the create API) rolls back the orphaned S3 objects instead of junking
      // the bucket.
      const uploadedMediaIds: string[] = [];
      try {
        if (avatarAsset) {
          const id = await uploadMedia(avatarAsset, "avatar");
          uploadedMediaIds.push(id);
          payload.avatarMediaId = id;
        }
        if (bannerAsset) {
          const id = await uploadMedia(bannerAsset, "banner");
          uploadedMediaIds.push(id);
          payload.bannerMediaId = id;
        }
        await onCreate(payload);
        reset();
        onClose();
      } catch (e: any) {
        uploadedMediaIds.forEach((mediaId) => {
          mediaService.cancleUpload(mediaId).catch(() => {});
        });
        themedAlert(
          "Error",
          e.response?.data?.message || "Failed to create community.",
        );
      }
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
              <StateBlock inline loading loaderSize={18} />
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
                  resizeMode="cover"
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
                  resizeMode="cover"
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
            placeholder="e.g. CampusCoders"
            placeholderTextColor={colors.text.muted}
            value={name}
            // Community names are username-style — letters, numbers and _ only.
            // Invalid characters are stripped as you type so the Create button
            // can never submit a bad name.
            onChangeText={(t) => setName(t.replace(/[^a-zA-Z0-9_]/g, ""))}
            maxLength={40}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={styles.nameHint}>
            Letters, numbers and _ only — no spaces or hyphens
          </Text>

          <Text style={styles.fieldLabel}>
            Description <Text style={styles.required}>*</Text>
          </Text>
          {/* SmartInput gives @mention / #hashtag suggestions like the profile
              bio — saved text keeps the structured {@}/{#} markup that the
              view renderers (BioText) turn back into tappable links. */}
          <SmartInput
            value={desc}
            onChange={setDesc}
            placeholder="What is this community about?"
            placeholderTextColor={colors.text.muted}
            multiline
            maxLength={200}
            style={[
              styles.fieldInput,
              styles.fieldInputMulti,
              { textAlignVertical: "top" },
            ]}
            containerStyle={{ marginBottom: 4 }}
          />

          <Text style={styles.fieldLabel}>Category</Text>
          <View style={styles.categoryGrid}>
            {categories.map((cat) => (
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

          <Text style={styles.fieldLabel}>Community Visibility</Text>
          <View style={styles.privacyOptions}>
            {[
              {
                key: "public",
                icon: "globe-outline",
                title: "Public",
                desc: "Anyone can find, view and join this community.",
              },
              {
                key: "private",
                icon: "lock-closed-outline",
                title: "Private",
                desc: "Members must request to join and be approved.",
              },
            ].map((opt) => {
              const active = isPrivate === (opt.key === "private");
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[
                    styles.privacyOption,
                    active && styles.privacyOptionActive,
                  ]}
                  activeOpacity={0.8}
                  onPress={() => setIsPrivate(opt.key === "private")}
                >
                  {active && (
                    <Ionicons
                      name="checkmark-circle"
                      size={18}
                      color={colors.primary}
                      style={styles.privacyOptionCheck}
                    />
                  )}
                  <View
                    style={[
                      styles.privacyOptionIcon,
                      active && { backgroundColor: "rgba(124,58,237,0.15)" },
                    ]}
                  >
                    <Ionicons
                      name={opt.icon as any}
                      size={20}
                      color={active ? colors.primaryLight : colors.text.muted}
                    />
                  </View>
                  <Text
                    style={[
                      styles.privacyOptionTitle,
                      active && { color: colors.primaryLight },
                    ]}
                  >
                    {opt.title}
                  </Text>
                  <Text style={styles.privacyOptionDesc}>{opt.desc}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
})
