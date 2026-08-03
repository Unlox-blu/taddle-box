import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { fontSizes, spacing, radii, type ColorPalette } from "../../theme";
import { useTheme, useThemeColors } from "../../context/ThemeContext";
import { searchService, type SearchType } from "../../services/search.service";
import type { HomeStackParamList, Post } from "../../types";
import { useToggleLike, useToggleSave } from "../../mutations/posts";
import PostCard from "../../components/home/PostCard";

type Props = NativeStackScreenProps<HomeStackParamList, "Search">;

// Tabs rendered at the top of the search screen (ordered).
const TABS: { key: SearchType; label: string }[] = [
  { key: "all", label: "All" },
  { key: "posts", label: "Posts" },
  { key: "people", label: "People" },
  { key: "communities", label: "Communities" },
  { key: "events", label: "Events" },
  { key: "games", label: "Games" },
  { key: "hashtags", label: "Hashtags" },
];

const normalizePostResult = (item: any): Post => {
  const author = item.author || {
    id: item.authorId || item.author_id || "",
    name: item.authorName || item.author_name || "Unknown User",
    username: item.authorUsername || item.author_username || "unknown",
    handle: item.authorUsername || item.author_username || "unknown",
    avatarUrl: item.user_avatar || item.author_avatar || item.authorAvatar || item.avatar || item.avatarUrl || item.avatar_url,
    avatar: item.user_avatar || item.author_avatar || item.authorAvatar || item.avatar || item.avatarUrl || item.avatar_url || '',
    level: 1,
    xp: 0,
    xpToNext: 100,
  };

  return {
    ...item,
    author,
    media: item.media || [],
    hashtags: item.hashtags || item.tags || [],
    likes: item.likes ?? item.likesCount ?? item.likes_count ?? 0,
    comments: item.comments ?? item.commentsCount ?? item.comments_count ?? 0,
    shares: item.shares ?? item.sharesCount ?? item.shares_count ?? 0,
    isLiked: !!(item.isLiked ?? item.is_liked),
    isSaved: !!(item.isSaved ?? item.is_saved),
    createdAt: item.createdAt || item.created_at,
    publishedAt: item.publishedAt || item.published_at,
    type: item.type || (item.media?.length ? "image" : "text"),
  } as Post;
};

type Row =
  | { isHeader: true; title: string; type: SearchType }
  | { isHeader: false; item: any; type: SearchType };

export default function SearchScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // If passed from hashtag click or header context
  const initialQuery = (route.params as any)?.query || "";
  const initialTab = (route.params as any)?.tab || "all";

  const [query, setQuery] = useState(initialQuery);
  const [activeTab, setActiveTab] = useState<SearchType>(initialTab);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  const { mutate: toggleLike } = useToggleLike();
  const { mutate: toggleSave } = useToggleSave();

  // Build a flat, sectioned row list for the "all" tab.
  const buildAllRows = (r: any, isDiscovery: boolean): Row[] => {
    const sections: { title: string; type: SearchType; items: any[] }[] = [
      { title: isDiscovery ? "People to Follow" : "People", type: "people", items: r.people },
      { title: "Communities", type: "communities", items: r.communities },
      { title: "Upcoming Events", type: "events", items: r.events },
      { title: "Games", type: "games", items: r.games },
      { title: isDiscovery ? "Trending Posts" : "Posts", type: "posts", items: r.posts },
      { title: "Hashtags", type: "hashtags", items: r.hashtags.map((h: string) => ({ text: h })) },
    ];

    const out: Row[] = [];
    sections.forEach((section) => {
      if (!section.items?.length) return;
      out.push({ isHeader: true, title: section.title, type: section.type });
      section.items.forEach((item: any) =>
        out.push({ isHeader: false, item: { ...item, itemType: section.type }, type: section.type }),
      );
    });
    return out;
  };

  const fetchResults = useCallback(async (q: string, tab: SearchType) => {
    setLoading(true);
    try {
      if (tab === "all") {
        // Single combined request — the backend runs all searches in parallel.
        const res = await searchService.searchAll(q, 6);
        setRows(buildAllRows(res, !q.trim()));
      } else if (tab === "hashtags") {
        const hashtags = await searchService.getHashtags(q);
        setRows(
          hashtags.map((h) => ({ isHeader: false, item: { text: h, itemType: "hashtags" }, type: "hashtags" as SearchType })),
        );
      } else {
        const items = await searchService.searchByType(tab, q);
        setRows(items.map((item) => ({ isHeader: false, item, type: tab })));
      }
    } catch (e) {
      console.warn("Search failed", e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = setTimeout(() => {
      fetchResults(query, activeTab);
    }, 300);
    return () => clearTimeout(handler);
  }, [query, activeTab, fetchResults]);

  // Open a games tab result inside the Games screen.
  const openGames = () => {
    (navigation as any).navigate("Main", { screen: "Games" });
  };

  const renderTab = (tab: { key: SearchType; label: string }) => (
    <TouchableOpacity
      style={[styles.tabBtn, activeTab === tab.key && styles.tabBtnActive]}
      onPress={() => setActiveTab(tab.key)}
      activeOpacity={0.8}
    >
      <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
        {tab.label}
      </Text>
    </TouchableOpacity>
  );

  const renderItem = ({ item }: { item: Row }) => {
    if (item.isHeader) {
      return (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{item.title}</Text>
          <TouchableOpacity onPress={() => setActiveTab(item.type)}>
            <Text style={styles.seeAll}>See all</Text>
          </TouchableOpacity>
        </View>
      );
    }

    const { item: data, type } = item;

    if (type === "posts") {
      const post = normalizePostResult(data);
      return (
        <PostCard
          post={post}
          onLike={() =>
            toggleLike({ id: post.id, isCurrentlyLiked: post.isLiked || false })
          }
          onSave={() =>
            toggleSave({ id: post.id, isCurrentlySaved: post.isSaved || false })
          }
          onComment={() => navigation.navigate("Comments", { post })}
          onShare={() => {}}
        />
      );
    }

    if (type === "people") {
      return (
        <TouchableOpacity
          style={styles.peopleRow}
          onPress={() => navigation.navigate("UserProfile", { user: data })}
          activeOpacity={0.8}
        >
          <View style={styles.avatarBubble}>
            {data.user_avatar ||
            data.avatar ||
            data.avatarUrl ||
            data.avatar_url ||
            data.profile_image ? (
              <Image
                source={{
                  uri:
                    data.user_avatar ||
                    data.avatar ||
                    data.avatarUrl ||
                    data.avatar_url ||
                    data.profile_image,
                }}
                style={styles.avatarImg}
              />
            ) : (
              <Text style={{ fontSize: 18 }}>👾</Text>
            )}
          </View>
          <View style={styles.peopleInfo}>
            <Text style={styles.peopleName}>{data.name}</Text>
            <Text style={styles.peopleHandle}>@{data.username}</Text>
            <Text style={styles.peopleMeta}>{data.follower_count || 0} followers</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.text.muted} />
        </TouchableOpacity>
      );
    }

    if (type === "communities") {
      return (
        <TouchableOpacity
          style={styles.peopleRow}
          onPress={() =>
            (navigation as any).navigate("Community", {
              screen: "CommunityDetail",
              params: { communitySlug: data.slug },
            })
          }
          activeOpacity={0.8}
        >
          <View style={styles.avatarBubble}>
            {(data.community_avatar || data.avatar || data.avatarUrl || data.avatar_url) ? (
              <Image
                source={{
                  uri: data.community_avatar || data.avatar || data.avatarUrl || data.avatar_url,
                }}
                style={styles.avatarImg}
              />
            ) : (
              <Ionicons
                name="people-outline"
                size={18}
                color={colors.text.muted}
              />
            )}
          </View>
          <View style={styles.peopleInfo}>
            <Text style={styles.peopleName}>{data.name}</Text>
            <Text style={styles.peopleHandle}>
              {data.member_count || 0} members
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.text.muted} />
        </TouchableOpacity>
      );
    }

    if (type === "events") {
      const location =
        typeof data.location === "object"
          ? data.location?.address || "Online"
          : data.location || "Online";
      return (
        <TouchableOpacity
          style={styles.peopleRow}
          onPress={() => (navigation as any).navigate("Main", { screen: "Events" })}
          activeOpacity={0.8}
        >
          <View style={styles.avatarBubble}>
            {data.cover_image_url ? (
              <Image
                source={{ uri: data.cover_image_url }}
                style={styles.avatarImg}
              />
            ) : (
              <Text style={{ fontSize: 18 }}>📅</Text>
            )}
          </View>
          <View style={styles.peopleInfo}>
            <Text style={styles.peopleName}>{data.title}</Text>
            <Text style={styles.peopleHandle}>{location}</Text>
            <Text style={styles.peopleMeta}>
              {data.attendee_count || 0} attending · {data.event_type || "event"}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.text.muted} />
        </TouchableOpacity>
      );
    }

    if (type === "games") {
      const thumbnail = data.thumbnail;
      return (
        <TouchableOpacity
          style={styles.peopleRow}
          onPress={openGames}
          activeOpacity={0.8}
        >
          <View style={styles.avatarBubble}>
            {thumbnail ? (
              <Image source={{ uri: thumbnail }} style={styles.avatarImg} />
            ) : (
              <Text style={{ fontSize: 18 }}>🎮</Text>
            )}
          </View>
          <View style={styles.peopleInfo}>
            <Text style={styles.peopleName}>{data.name}</Text>
            <Text style={styles.peopleHandle}>
              {[data.category, data.difficulty].filter(Boolean).join(" · ") || "Play now"}
            </Text>
            <Text style={styles.peopleMeta}>Up to {data.maxPlayers || 2} players</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.text.muted} />
        </TouchableOpacity>
      );
    }

    if (type === "hashtags") {
      return (
        <TouchableOpacity
          style={styles.hashtagRow}
          onPress={() => {
            setQuery(data.text);
            setActiveTab("posts");
          }}
          activeOpacity={0.8}
        >
          <View style={styles.hashIconBubble}>
            <Text style={styles.hashIcon}>#</Text>
          </View>
          <Text style={styles.hashtagText}>{data.text}</Text>
        </TouchableOpacity>
      );
    }

    return (
      <View style={styles.genericRow}>
        <Text style={{ color: colors.text.primary }}>
          {data.name || data.title || "Result"}
        </Text>
      </View>
    );
  };

  const isEmptyQuery = !query.trim();
  const hasResults = rows.length > 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar style={isDark ? "light" : "dark"} />

      {/* Header Search Bar */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color={colors.text.muted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search Taddlebox..."
            placeholderTextColor={colors.text.muted}
            value={query}
            onChangeText={setQuery}
            autoFocus
            returnKeyType="search"
            autoCapitalize="none"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery("")}>
              <Ionicons
                name="close-circle"
                size={18}
                color={colors.text.muted}
              />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Tabs */}
      <View>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={TABS}
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.tabsContainer}
          renderItem={({ item }) => renderTab(item)}
        />
      </View>

      {/* Results */}
      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={colors.primaryLight} />
        </View>
      ) : hasResults ? (
        <FlatList
          data={rows}
          keyExtractor={(row, index) =>
            row.isHeader ? `header-${row.type}-${index}` : `${row.type}-${row.item.id || index}`
          }
          renderItem={renderItem}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + 20 },
          ]}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            isEmptyQuery && activeTab === "all" ? (
              <View style={styles.discoverBanner}>
                <Ionicons name="sparkles" size={18} color={colors.xpGold} />
                <Text style={styles.discoverText}>Discoveries — popular right now</Text>
              </View>
            ) : null
          }
        />
      ) : isEmptyQuery ? (
        <View style={styles.centerBox}>
          <Ionicons name="search-outline" size={64} color={colors.border} />
          <Text style={styles.emptyText}>
            Type something to start searching, or explore the tabs above.
          </Text>
        </View>
      ) : (
        <View style={styles.centerBox}>
          <Text style={styles.emptyText}>
            No results found for "{query}" in {activeTab}
          </Text>
        </View>
      )}
    </View>
  );
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.bg.base,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: spacing.sm,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      backgroundColor: c.bg.surface,
    },
    backBtn: {
      padding: spacing.sm,
    },
    searchBar: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: c.bg.elevated,
      borderRadius: radii.full,
      paddingHorizontal: 12,
      paddingVertical: 8,
      marginRight: spacing.sm,
      borderWidth: 1,
      borderColor: c.border,
    },
    searchInput: {
      flex: 1,
      marginLeft: 8,
      marginRight: 8,
      fontSize: fontSizes.md,
      color: c.text.primary,
    },
    tabsContainer: {
      paddingHorizontal: spacing.md,
      paddingVertical: 12,
      gap: 12,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    tabBtn: {
      paddingVertical: 6,
      paddingHorizontal: 14,
      borderRadius: radii.full,
      backgroundColor: c.bg.elevated,
      borderWidth: 1,
      borderColor: c.border,
    },
    tabBtnActive: {
      backgroundColor: c.primaryLight,
      borderColor: c.primaryLight,
    },
    tabText: {
      fontSize: fontSizes.sm,
      fontWeight: "600",
      color: c.text.secondary,
    },
    tabTextActive: {
      color: "#fff",
    },
    listContent: {
      paddingVertical: spacing.md,
      gap: 4,
    },
    discoverBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginHorizontal: spacing.md,
      marginBottom: 6,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: radii.md,
      backgroundColor: "rgba(251,191,36,0.08)",
      borderWidth: 1,
      borderColor: "rgba(251,191,36,0.22)",
    },
    discoverText: {
      fontSize: fontSizes.sm,
      fontWeight: "700",
      color: c.xpGold,
    },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: spacing.lg,
      paddingTop: 14,
      paddingBottom: 6,
    },
    sectionTitle: {
      fontSize: fontSizes.md,
      fontWeight: "800",
      color: c.text.primary,
    },
    seeAll: {
      fontSize: fontSizes.xs,
      fontWeight: "700",
      color: c.primaryLight,
    },
    centerBox: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingTop: 60,
      paddingHorizontal: spacing.xl,
    },
    emptyText: {
      marginTop: 16,
      fontSize: fontSizes.md,
      color: c.text.muted,
      textAlign: "center",
    },
    peopleRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: c.bg.card,
      padding: spacing.md,
      marginHorizontal: spacing.md,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: c.border,
    },
    avatarBubble: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: c.bg.elevated,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 12,
      overflow: "hidden",
    },
    avatarImg: {
      width: "100%",
      height: "100%",
    },
    peopleInfo: {
      flex: 1,
    },
    peopleName: {
      fontSize: fontSizes.md,
      fontWeight: "700",
      color: c.text.primary,
    },
    peopleHandle: {
      fontSize: fontSizes.sm,
      color: c.text.muted,
      marginTop: 2,
    },
    peopleMeta: {
      fontSize: fontSizes.xs,
      color: c.text.muted,
      marginTop: 2,
      opacity: 0.8,
    },
    genericRow: {
      backgroundColor: c.bg.card,
      padding: spacing.md,
      marginHorizontal: spacing.md,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: c.border,
    },
    hashtagRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: c.bg.card,
      padding: spacing.md,
      marginHorizontal: spacing.md,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: c.border,
    },
    hashIconBubble: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: c.bg.surface,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 12,
    },
    hashIcon: {
      color: c.text.secondary,
      fontWeight: "bold",
    },
    hashtagText: {
      fontSize: fontSizes.md,
      fontWeight: "600",
      color: c.text.primary,
    },
  });
}
