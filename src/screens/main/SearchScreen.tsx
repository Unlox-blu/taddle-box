import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Image,

  Share,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { fontSizes, spacing, radii, type ColorPalette } from "../../theme";
import { useTheme, useThemeColors } from "../../context/ThemeContext";
import { useAuth } from "../../context/AuthContext";
import { searchService, type SearchType } from "../../services/search.service";
import type { HomeStackParamList, Post } from "../../types";
import { useToggleLike, useToggleSave } from "../../mutations/posts";
import PostCard from "../../components/home/PostCard";
import { themedAlert } from '../../components/common/ThemedAlert';

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
    // Search returns the raw snake_case column — carry it as the camelCase
    // key PostCard checks so the embedded original preview renders for reposts.
    repostOfId: item.repostOfId ?? item.repost_of_id ?? null,
    media: item.media || [],
    hashtags: item.hashtags || item.tags || [],
    likes: item.likes ?? item.likesCount ?? item.likes_count ?? 0,
    comments: item.comments ?? item.commentsCount ?? item.comments_count ?? 0,
    shares: item.shares ?? item.sharesCount ?? item.shares_count ?? 0,
    // Backend returns is_liked / is_bookmarked (snake_case) — accept all
    // spellings so search results render the heart + bookmark icons correctly.
    isLiked: !!(item.isLiked ?? item.is_liked),
    isSaved: !!(item.isSaved ?? item.is_saved ?? item.isBookmarked ?? item.is_bookmarked),
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
  const [loading, setLoading] = useState(false);

  // Hashtag taps navigate to Search with { query, tab: 'hashtags' }. When the
  // Search screen is ALREADY in the stack, navigate() pops back to the existing
  // instance instead of mounting a fresh one — its useState initializers won't
  // re-run, so sync params → state here to pick up the new query/tab. The query
  // change then flows through the normal cache-reset + fetch path below.
  useEffect(() => {
    const p = route.params as any;
    if (p?.query !== undefined) setQuery(p.query);
    if (p?.tab) setActiveTab(p.tab as SearchType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [(route.params as any)?.query, (route.params as any)?.tab]);
  // Track whether we've loaded discovery content at least once — prevents the
  // empty-state flash on the "all" tab when discovery data is already available.
  const [discoveryLoaded, setDiscoveryLoaded] = useState(false);

  // ── Per-tab results cache ──
  // Each tab keeps its own rows + pagination + scroll offset, so switching tabs
  // back and forth restores exactly where you left off instead of resetting to
  // page 1. The cache is invalidated only when the QUERY changes.
  const [rowsByTab, setRowsByTab] = useState<Partial<Record<SearchType, Row[]>>>({});
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const tabPageRef = useRef<Record<string, number>>({});
  const tabHasMoreRef = useRef<Record<string, boolean>>({});
  // Guards against out-of-order responses when typing/tab-switching fast — only
  // the latest request may commit its rows.
  const searchReqRef = useRef(0);
  // Mirrors so effects/async flows read fresh values without re-subscribing.
  const rowsByTabRef = useRef(rowsByTab);
  rowsByTabRef.current = rowsByTab;
  const lastQueryRef = useRef(query);
  // Per-tab scroll offsets — saved on leave, restored on return.
  const scrollOffsetsRef = useRef<Record<string, number>>({});
  const scrollOffsetCurrentRef = useRef(0);
  const listRef = useRef<FlatList<any>>(null);

  // Active tab's rows — derived from the cache so switching tabs is instant.
  const rows = rowsByTab[activeTab] || [];

  const { user: currentUser } = useAuth();
  const { mutate: toggleLike } = useToggleLike();
  const { mutate: toggleSave } = useToggleSave();

  // Section titles for the "all" tab. The API owns the ORDER (and may repeat
  // a type — each occurrence renders as its own section), so titles are keyed
  // by type rather than baked into a hardcoded sequence.
  const sectionTitle = (type: string, isDiscovery: boolean): string => {
    switch (type) {
      case "people":
        return isDiscovery ? "People to Follow" : "People";
      case "communities":
        return "Communities";
      case "events":
        return "Upcoming Events";
      case "games":
        return "Games";
      case "posts":
        return isDiscovery ? "Trending Posts" : "Posts";
      case "hashtags":
        return "Hashtags";
      default:
        // Unknown section type from a newer server — show it with a readable
        // title instead of dropping the content.
        return type.charAt(0).toUpperCase() + type.slice(1);
    }
  };

  // Build a flat, sectioned row list for the "all" tab. Sections render in the
  // exact order the API returns them (the server's `sections` array), and a
  // type repeated in the response produces two separate sections — the client
  // never reorders or merges. Older servers without `sections` fall back to the
  // flat keys in canonical order. Empty sections are skipped.
  const buildAllRows = (r: any, isDiscovery: boolean): Row[] => {
    const sections: { type: string; items: any[] }[] =
      Array.isArray(r?.sections) && r.sections.length > 0
        ? r.sections
        : [
            { type: "people", items: r.people },
            { type: "communities", items: r.communities },
            { type: "events", items: r.events },
            { type: "games", items: r.games },
            { type: "posts", items: r.posts },
            { type: "hashtags", items: r.hashtags },
          ];

    const out: Row[] = [];
    sections.forEach((section) => {
      const type = section.type as SearchType;
      let items = Array.isArray(section.items) ? section.items : [];
      if (!items.length) return;
      out.push({ isHeader: true, title: sectionTitle(type, isDiscovery), type });
      if (type === "hashtags") {
        // Don't duplicate the hashtag rows inline — they live on the dedicated
        // Hashtags tab. The section is a single doorway that jumps there and
        // runs the hashtag search (see renderItem's viewAll branch).
        out.push({ isHeader: false, item: { viewAll: true, itemType: "hashtags" }, type });
        return;
      }
      items.forEach((item: any) =>
        out.push({ isHeader: false, item: { ...item, itemType: type }, type }),
      );
    });
    return out;
  };

  const fetchResults = useCallback(async (
    q: string,
    tab: SearchType,
    pageToLoad = 1,
    append = false,
    // Pull-to-refresh: skip the full-screen loading spinner (the RefreshControl
    // shows its own) so the list stays visible while it re-fetches.
    silent = false,
  ) => {
    const reqId = ++searchReqRef.current;
    if (!append && !silent) setLoading(true);
    try {
      if (tab === "all") {
        // Discovery overview — one request with per-section previews. The "See
        // all" buttons jump to the fully paginated individual tabs.
        if (append) return;
        const res = await searchService.searchAll(q, 6);
        const built = buildAllRows(res, !q.trim());
        setRowsByTab((prev) => ({ ...prev, [tab]: built }));
        if (!q.trim() && built.length > 0) setDiscoveryLoaded(true);
      } else if (tab === "hashtags") {
        if (append) return;
        const hashtags = await searchService.getHashtags(q);
        setRowsByTab((prev) => ({
          ...prev,
          [tab]: hashtags.map((h) => ({ isHeader: false, item: { text: h, itemType: "hashtags" }, type: "hashtags" as SearchType })),
        }));
      } else {
        const res = await searchService.searchByType(tab, q, pageToLoad, 10);
        // A newer request (typing / tab switch) started after this one — drop it.
        if (searchReqRef.current !== reqId) return;
        tabHasMoreRef.current[tab] = res.hasNext;
        tabPageRef.current[tab] = res.page;
        const newRows: Row[] = res.items.map((item) => ({
          isHeader: false as const,
          item,
          type: tab as SearchType,
        }));
        setRowsByTab((prev) => {
          const existing = prev[tab] || [];
          return {
            ...prev,
            [tab]: append
              ? [
                  ...existing,
                  ...newRows.filter(
                    (row: any) => !existing.some((r: any) => !r.isHeader && r.item?.id === row.item?.id),
                  ),
                ]
              : newRows,
          };
        });
      }
    } catch (e) {
      console.warn("Search failed", e);
      if (!append) setRowsByTab((prev) => ({ ...prev, [tab]: [] }));
    } finally {
      if (searchReqRef.current === reqId) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, []);

  // Pull-to-refresh — re-fetch the ACTIVE tab's first page (replaces the rows
  // for that tab; other tabs keep their cached results + scroll offsets).
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchResults(query, activeTab, 1, false, true);
    } finally {
      setRefreshing(false);
    }
  }, [query, activeTab, fetchResults]);

  // Infinite scroll — appends the next page on individual tabs (posts, people,
  // communities, events, games) using that tab's own pagination refs. The
  // "all" and "hashtags" tabs are single requests.
  const loadMore = useCallback(() => {
    if (activeTab === "all" || activeTab === "hashtags") return;
    if (!tabHasMoreRef.current[activeTab] || loadingMore || loading) return;
    setLoadingMore(true);
    fetchResults(query, activeTab, (tabPageRef.current[activeTab] || 1) + 1, true);
  }, [activeTab, loadingMore, loading, query, fetchResults]);

  // Switching tabs saves the outgoing tab's scroll offset so it can be
  // restored exactly on return. The QUERY is shared state, so it stays
  // pre-filled in the input on every tab; the tab-switch effect below either
  // restores the incoming tab's cached rows + scroll (already fetched for this
  // query) or fetches its first page fresh.
  const switchTab = useCallback((tab: SearchType) => {
    if (tab === activeTab) return;
    scrollOffsetsRef.current[activeTab] = scrollOffsetCurrentRef.current;
    setActiveTab(tab);
  }, [activeTab]);

  // "See all" on an All-tab section header → deep-link to that section's tab
  // with the current query kept (shared state) and scroll restored by the
  // tab-switch effect. Same path as the tab bar, named for intent.
  const seeAll = useCallback((tab: SearchType) => switchTab(tab), [switchTab]);

  // Single debounced effect: on a QUERY change every tab's cache is invalidated
  // and the active tab refetches; on a TAB switch the cached rows (if any) are
  // kept and only scrolled back into place — no reset to page 1.
  useEffect(() => {
    const queryChanged = lastQueryRef.current !== query;
    lastQueryRef.current = query;
    const handler = setTimeout(() => {
      if (queryChanged) {
        // New query → drop every tab's cache + pagination + scroll offsets.
        setRowsByTab({});
        tabPageRef.current = {};
        tabHasMoreRef.current = {};
        scrollOffsetsRef.current = {};
        scrollOffsetCurrentRef.current = 0;
      }
      const cached = rowsByTabRef.current[activeTab];
      if (!queryChanged && cached && cached.length > 0) {
        // Already fetched for this query — just restore the scroll position
        // (an offset of 0 — user was at the top — is still a valid restore).
        const offset = scrollOffsetsRef.current[activeTab];
        if (typeof offset === "number" && offset > 0 && listRef.current) {
          requestAnimationFrame(() => {
            listRef.current?.scrollToOffset({ offset, animated: false });
          });
        }
        return;
      }
      fetchResults(query, activeTab);
    }, queryChanged ? 300 : 0);
    return () => clearTimeout(handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, activeTab, fetchResults]);

  // Open a games tab result inside the Games screen.
  const openGames = () => {
    (navigation as any).navigate("Main", { screen: "Games" });
  };

  const renderTab = (tab: { key: SearchType; label: string }) => (
    <TouchableOpacity
      style={[styles.tabBtn, activeTab === tab.key && styles.tabBtnActive]}
      onPress={() => switchTab(tab.key)}
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
          <TouchableOpacity onPress={() => seeAll(item.type)}>
            <Text style={styles.seeAll}>See all</Text>
          </TouchableOpacity>
        </View>
      );
    }

    const { item: data, type } = item;

    if (type === "posts") {
      const post = normalizePostResult(data);
      // Patch the row in local state so the icon flips instantly and stays
      // consistent across re-renders (search results aren't react-query
      // cached, so the useToggleSave/useToggleLike cache updates miss them).
      const patchPost = (patch: Partial<Post>) => {
        setRowsByTab((prev) => {
          const list = prev.posts || [];
          return {
            ...prev,
            posts: list.map((row) =>
              row.isHeader || row.type !== "posts" || (row.item as any)?.id !== post.id
                ? row
                : { ...row, item: { ...(row.item as any), ...patch } },
            ),
          };
        });
      };
      return (
        <PostCard
          post={post}
          onLike={() => {
            toggleLike({ id: post.id, isCurrentlyLiked: post.isLiked || false });
            patchPost({ isLiked: !post.isLiked });
          }}
          onSave={() => {
            toggleSave({ id: post.id, isCurrentlySaved: post.isSaved || false });
            patchPost({ isSaved: !post.isSaved });
          }}
          onComment={(p: any) =>
            navigation.push("PostDetail", { post: p ?? post })
          }
          onShare={() => {
            const shareTitle = (post as any)?.title || `${post.author?.name || "User"}'s Post`;
            const appUrl = `https://taddlebox.com/post/${post.id}`;
            Share.share({
              message: `${shareTitle}\n\n${appUrl}`,
              url: appUrl,
              title: shareTitle,
            }).catch(() => {});
          }}
          onAuthorPress={() =>
            navigation.push("UserProfile", { user: post.author })
          }
          onReport={() =>
            themedAlert("Reported", "Thank you. This post has been reported for review.")
          }
          showDelete={!!currentUser && currentUser.id === (post as any)?.author?.id}
          onReposted={() => fetchResults(query, activeTab)}
        />
      );
    }

    if (type === "people") {
      return (
        <TouchableOpacity
          style={styles.peopleRow}
          onPress={() => navigation.push("UserProfile", { user: data })}
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
      // All-tab section doorway — jump to the dedicated Hashtags tab (runs the
      // hashtag search there) instead of showing the rows inline here.
      if (data?.viewAll) {
        return (
          <TouchableOpacity
            style={styles.hashtagRow}
            onPress={() => seeAll("hashtags")}
            activeOpacity={0.8}
          >
            <View style={styles.hashIconBubble}>
              <Ionicons name="pricetags-outline" size={15} color={colors.primaryLight} />
            </View>
            <Text style={styles.hashtagText}>Browse all hashtags</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.text.muted} />
          </TouchableOpacity>
        );
      }
      // Dedicated Hashtags-tab rows — tap runs the posts search for that tag.
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

  // Show a discovery hint only on the "all" tab with no search query.
  // Don't show the generic "type something" empty state when we already know
  // discovery content was loaded — it briefly flashes before rows populate.
  const showSearchPrompt = isEmptyQuery && !hasResults && !loading && !discoveryLoaded && activeTab === "all";

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
          ref={listRef}
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
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primaryLight}
              colors={[colors.primaryLight]}
            />
          }
          // Track the live offset so switching tabs can save/restore it.
          onScroll={(e) => {
            scrollOffsetCurrentRef.current = e.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={16}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator
                size="small"
                color={colors.primaryLight}
                style={{ paddingVertical: 16 }}
              />
            ) : null
          }
          ListHeaderComponent={
            isEmptyQuery && activeTab === "all" ? (
              <View style={styles.discoverBanner}>
                <Ionicons name="sparkles" size={18} color={colors.xpGold} />
                <Text style={styles.discoverText}>Discoveries — popular right now</Text>
              </View>
            ) : null
          }
        />
      ) : showSearchPrompt ? (
        <View style={styles.centerBox}>
          <Ionicons name="search-outline" size={64} color={colors.border} />
          <Text style={styles.emptyText}>
            Type something to start searching, or explore the tabs above.
          </Text>
        </View>
      ) : !isEmptyQuery ? (
        <View style={styles.centerBox}>
          <Text style={styles.emptyText}>
            No results found for "{query}" in {activeTab}
          </Text>
        </View>
      ) : (
        // Empty query + no rows on an individual tab — e.g. a "See all" jump
        // from the discovery view. Show a hint instead of a blank screen.
        <View style={styles.centerBox}>
          <Ionicons name="compass-outline" size={56} color={colors.border} />
          <Text style={styles.emptyText}>
            Nothing here yet — type a search, or explore the All tab.
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
