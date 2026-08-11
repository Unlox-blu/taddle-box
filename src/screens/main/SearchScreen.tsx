import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
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
  Modal,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { fontSizes, spacing, radii, type ColorPalette } from "../../theme";
import { useTheme, useThemeColors } from "../../context/ThemeContext";
import { useAuth } from "../../context/AuthContext";
import { searchService, type SearchType } from "../../services/search.service";
import { userService } from "../../services/user.service";
import { communityService } from "../../services/community.service";
import { hashtagService } from "../../services/hashtag.service";
import { notificationService } from "../../services/notification.service";
import type { HomeStackParamList, Post } from "../../types";
import AppRefreshControl from "../../components/common/AppRefreshControl";
import { useToggleLike, useToggleSave } from "../../mutations/posts";
import PostCard from "../../components/home/PostCard";
import { themedAlert } from "../../components/common/ThemedAlert";
import AsyncStorage from "@react-native-async-storage/async-storage";

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

// Reddit-style filter-token pattern: a boxed token becomes a removable chip.
// `@user` scopes results to people involved, `c/community` scopes them to that
// community's posts, `#tag` scopes them to posts carrying that hashtag — they
// combine (e.g. "@pravin_viswa c/tvk #peaceful").
const TOKEN_FILTER_RE = /^(@[^\s@]+|c\/[^\s/]+|#[^\s#]+|\.\/[a-z]+|p\/|g\/)$/i;

// Filter-mode tabs — shown in place of the regular tabs while a PERSON filter
// (@user) is active. Each narrows which involvement dimension matches; "All"
// keeps everything involving the tagged people.
const FILTER_TABS: { key: string; label: string }[] = [
  { key: "f-all", label: "All" },
  { key: "f-authored", label: "Posts" },
  { key: "f-mentions", label: "Mentions" },
  { key: "f-comments", label: "Comments" },
  { key: "f-reposts", label: "Reposts" },
];
// "f-all" → no narrowing; every other filter tab maps to its dimension.
const involvementOf = (key: string) => (key === "f-all" ? "" : key.slice(2));

// Bookmarks-mode tabs — shown while the search is scoped to saved content
// (opened from the Bookmarks screen). All/Posts search saved posts; Events
// searches saved events.
const BOOKMARK_TABS: { key: string; label: string }[] = [
  { key: "bm-all", label: "All" },
  { key: "bm-posts", label: "Posts" },
  { key: "bm-events", label: "Events" },
];

const POST_TABS: { key: string; label: string }[] = [
  { key: "p-contents", label: "Contents" },
  { key: "p-comments", label: "Comments" },
  { key: "p-mentions", label: "Mentions" },
];

const NOTIF_TABS: { key: string; label: string }[] = [
  { key: "n-all", label: "All" },
  { key: "n-likes", label: "Likes" },
  { key: "n-comments", label: "Comments" },
  { key: "n-follows", label: "Follows" },
];

const SETTINGS_ITEMS = [
  { id: "edit_profile", title: "Edit Profile", icon: "person-outline", route: "EditProfile", keywords: ["name", "avatar", "bio", "profile"] },
  { id: "app_lock", title: "App Lock & PIN", icon: "lock-closed-outline", route: "Settings", keywords: ["security", "passcode", "fingerprint", "face id", "lock"] },
  { id: "change_password", title: "Change Password", icon: "key-outline", route: "ChangePassword", keywords: ["security", "password"] },
  { id: "phone", title: "Phone Number", icon: "call-outline", route: "ChangePhone", keywords: ["mobile", "phone"] },
  { id: "email", title: "Email Address", icon: "mail-outline", route: "ChangeEmail", keywords: ["contact", "email"] },
  { id: "notifications", title: "Notification Preferences", icon: "notifications-outline", route: "Settings", keywords: ["alerts", "push", "emails", "notifications"] },
  { id: "privacy", title: "Account Privacy", icon: "eye-off-outline", route: "Settings", keywords: ["public", "private", "activity", "status", "privacy"] },
  { id: "preferences", title: "App Preferences", icon: "options-outline", route: "Settings", keywords: ["theme", "dark mode", "language", "content", "safe search", "haptics", "sound", "preferences"] },
  { id: "terms", title: "Terms of Service", icon: "document-text-outline", route: "Terms", keywords: ["legal", "rules", "terms"] },
  { id: "privacy_policy", title: "Privacy Policy", icon: "shield-checkmark-outline", route: "Privacy", keywords: ["legal", "data", "privacy"] },
  { id: "delete_account", title: "Delete Account", icon: "trash-outline", route: "Settings", keywords: ["remove", "close", "deactivate", "delete"] },
  { id: "logout", title: "Log Out", icon: "log-out-outline", route: "Settings", keywords: ["sign out", "exit", "logout"] },
];

const normalizePostResult = (item: any): Post => {
  const author = item.author || {
    id: item.authorId || item.author_id || "",
    name: item.authorName || item.author_name || "Unknown User",
    username: item.authorUsername || item.author_username || "unknown",
    handle: item.authorUsername || item.author_username || "unknown",
    avatarUrl:
      item.user_avatar ||
      item.author_avatar ||
      item.authorAvatar ||
      item.avatar ||
      item.avatarUrl ||
      item.avatar_url,
    avatar:
      item.user_avatar ||
      item.author_avatar ||
      item.authorAvatar ||
      item.avatar ||
      item.avatarUrl ||
      item.avatar_url ||
      "",
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
    // Search returns the community as flat columns (community_name, slug, …) —
    // rebuild the nested object PostCard renders as the "• c/name" badge on
    // community posts.
    community:
      item.community ||
      (item.community_id
        ? {
            id: item.community_id,
            name: item.community_name || item.communityName,
            slug: item.community_slug || item.communitySlug,
            privacy: item.community_privacy,
            avatarUrl: item.community_avatar,
          }
        : undefined),
    media: item.media || [],
    hashtags: item.hashtags || item.tags || [],
    likes: item.likes ?? item.likesCount ?? item.likes_count ?? 0,
    comments: item.comments ?? item.commentsCount ?? item.comments_count ?? 0,
    shares: item.shares ?? item.sharesCount ?? item.shares_count ?? 0,
    // Backend returns is_liked / is_bookmarked (snake_case) — accept all
    // spellings so search results render the heart + bookmark icons correctly.
    isLiked: !!(item.isLiked ?? item.is_liked),
    isSaved: !!(
      item.isSaved ??
      item.is_saved ??
      item.isBookmarked ??
      item.is_bookmarked
    ),
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
  const initialQuery: string = (route.params as any)?.query || "";
  const initialTab = (route.params as any)?.tab || "all";
  // Reddit-style community scoping — opened from a community detail page,
  // results are limited to that community's posts. Local state so the chip's
  // X can clear the scope.
  const initialScope = (route.params as any)?.scopeCommunity || "";
  // Reddit-style author scoping — opened from a profile page, results are
  // limited to that user's posts (@username pre-applied as a chip). May be
  // comma-separated (e.g. "me,originalAuthor" from the repost sheet's
  // "View my reposts") — each becomes its own @user chip.
  const initialAuthor = (route.params as any)?.authorFilter || "";

  const [query, setQuery] = useState(initialQuery);
  // Filter-mode tabs use keys outside SearchType (f-all, f-mentions, …).
  const [activeTab, setActiveTab] = useState<string>(initialTab);
  const [loading, setLoading] = useState(false);
  const [scope, setScope] = useState(initialScope);
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  // Multiple people can be tagged (@a @b) — each becomes its own chip and the
  // API gets them comma-joined; any one of them being involved matches.
  const [authorFilters, setAuthorFilters] = useState<string[]>(
    initialAuthor
      ? String(initialAuthor)
          .split(",")
          .map((s: string) => s.trim())
          .filter(Boolean)
      : [],
  );
  const authorRef = useRef(authorFilters);
  authorRef.current = authorFilters;
  // Hashtags can be tagged too (#tag) — each becomes its own chip.
  const [tagFilters, setTagFilters] = useState<string[]>([]);
  const tagRef = useRef(tagFilters);
  tagRef.current = tagFilters;
  // Source scope — opened from Bookmarks (search saved content) or Settings
  // (search own posts). Rendered as its own chip with an X.
  const [source, setSource] = useState<string>(
    (route.params as any)?.source || "",
  );
  const sourceRef = useRef(source);
  sourceRef.current = source;

  const [sortBy, setSortBy] = useState<string>("relevance");
  const sortByRef = useRef(sortBy);
  sortByRef.current = sortBy;

  const [showFilters, setShowFilters] = useState(false);
  const [filterType, setFilterType] = useState("relevance");
  const [filterTime, setFilterTime] = useState("all_time");

  // Search Context states
  const [postMode, setPostMode] = useState(false);
  const postModeRef = useRef(postMode);
  postModeRef.current = postMode;

  const [gameMode, setGameMode] = useState(false);
  const gameModeRef = useRef(gameMode);
  gameModeRef.current = gameMode;

  const [postFilter, setPostFilter] = useState("contents");
  const postFilterRef = useRef(postFilter);
  postFilterRef.current = postFilter;

  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  useEffect(() => {
    AsyncStorage.getItem("@recent_searches").then((res) => {
      if (res) setRecentSearches(JSON.parse(res));
    });
  }, []);

  const saveRecentSearch = async (term: string) => {
    const trimmed = term.trim();
    if (!trimmed) return;
    const updated = [
      trimmed,
      ...recentSearches.filter((s) => s !== trimmed),
    ].slice(0, 10);
    setRecentSearches(updated);
    await AsyncStorage.setItem("@recent_searches", JSON.stringify(updated));
  };

  // ── Reddit-style filter chips ──
  // A token typed in the box and completed with a space (or committed on
  // submit) becomes a removable chip: `@user` scopes to that author's posts,
  // `c/community` scopes to that community's posts. They combine — e.g.
  // "@pravin_viswa c/tvk" returns that person's posts inside that community —
  // and the free text left in the box is what's actually searched.
  const applyTokenFilter = (token: string) => {
    const t = token.toLowerCase();
    if (t.startsWith("@")) {
      const u = token.slice(1);
      setAuthorFilters((prev) => (prev.includes(u) ? prev : [...prev, u]));
    } else if (t.startsWith("c/")) {
      setScope(token.slice(2));
    } else if (t.startsWith("#")) {
      const tag = token.slice(1);
      setTagFilters((prev) => (prev.includes(tag) ? prev : [...prev, tag]));
    } else if (t === "p/") {
      setPostMode(true);
      setActiveTab("p-contents"); // Custom tab for post mode
    } else if (t === "g/") {
      setGameMode(true);
      setActiveTab("games");
    } else if (t.startsWith("./")) {
      const destination = t.slice(2);
      if (destination === "settings") {
        (navigation as any).navigate("Settings");
      } else if (destination === "bookmarks") {
        (navigation as any).navigate("Bookmarks");
      } else if (destination === "notifications") {
        (navigation as any).navigate("Notifications");
      }
    }
  };

  // Commit every complete filter token in `text` (all tokens except the
  // trailing one, which may still be mid-typing) and return the free text
  // that remains. When the text ends with a space the last token is complete
  // too, so it's committed as well.
  const commitFilterTokens = (text: string): string => {
    const tokens = text.split(/\s+/).filter(Boolean);
    const complete = text.endsWith(" ");
    const commitCount = complete
      ? tokens.length
      : Math.max(0, tokens.length - 1);
    let freeText = text;
    for (let i = 0; i < commitCount; i++) {
      const t = tokens[i];
      if (TOKEN_FILTER_RE.test(t)) {
        applyTokenFilter(t);
        freeText = freeText.replace(t, "").trim();
      }
    }
    return freeText;
  };

  const handleQueryChange = (text: string) => {
    setQuery(commitFilterTokens(text));
  };

  // Pressing search commits a trailing filter token (e.g. "@foo" with no
  // space) so it still applies instead of being searched as plain text.
  const handleSubmit = () => {
    const next = commitFilterTokens(query + " ");
    if (next !== query) setQuery(next);
    const searchToSave = next.trim() || query.trim();
    saveRecentSearch(searchToSave);
  };

  // An uncommitted trailing @/c/ token isn't searched as plain text — strip
  // it until it's completed (space) and committed as a chip.
  const trailingToken = (() => {
    const tokens = query.split(/\s+/).filter(Boolean);
    const last = tokens[tokens.length - 1];
    return last && TOKEN_FILTER_RE.test(last) ? last : "";
  })();
  // Suggestions while typing: the trailing token may still be mid-typing
  // ("@", "@fo", "c/tv") — detect it by prefix so matching users (@) and
  // communities (c/) can be offered to tap-and-commit as a chip.
  const trailingRaw = (() => {
    const tokens = query.split(/\s+/).filter(Boolean);
    return tokens[tokens.length - 1] || "";
  })();
  const suggestionKind: "user" | "community" | "tag" | "nav" | null =
    trailingRaw.startsWith("@")
      ? "user"
      : trailingRaw.startsWith("c/")
        ? "community"
        : trailingRaw.startsWith("#")
          ? "tag"
          : trailingRaw.startsWith("./")
            ? "nav"
            : null;
  const suggestionKeyword = trailingRaw.slice(
    suggestionKind === "user"
      ? 1
      : suggestionKind === "community"
        ? 2
        : suggestionKind === "tag"
          ? 1
          : suggestionKind === "nav"
            ? 2
            : 0,
  );
  // The API query — filter chips are sent separately, so only the free text
  // (the uncommitted prefix token is stripped too while suggestions show).
  const effectiveQuery =
    trailingToken || suggestionKind
      ? query.replace(trailingToken || trailingRaw, "").trim()
      : query;

  // ── @user / c/community suggestions (Reddit-style autocomplete) ──
  const [suggestions, setSuggestions] = useState<{
    kind: "user" | "community" | "tag" | "nav";
    items: any[];
  }>({ kind: "user", items: [] });
  const [suggestionsVisible, setSuggestionsVisible] = useState(false);

  useEffect(() => {
    if (!suggestionKind) {
      setSuggestionsVisible(false);
      return;
    }
    let cancelled = false;
    const handler = setTimeout(async () => {
      try {
        let items: any[] = [];
        if (suggestionKind === "user") {
          const res = await userService.searchUsers(suggestionKeyword);
          items = res?.data || [];
        } else if (suggestionKind === "community") {
          const res = await communityService.getCommunities(
            1,
            20,
            suggestionKeyword,
          );
          items = res?.data || [];
        } else if (suggestionKind === "nav") {
          const routes = [
            { id: "settings", title: "Settings", icon: "settings-outline" },
            { id: "bookmarks", title: "Bookmarks", icon: "bookmark-outline" },
            {
              id: "notifications",
              title: "Notifications",
              icon: "notifications-outline",
            },
          ];
          items = routes.filter((r) =>
            r.id.startsWith(suggestionKeyword.toLowerCase()),
          );
        } else {
          const res = await hashtagService.getHashtags(suggestionKeyword);
          items = (res?.data || []).map((h: any) =>
            typeof h === "string" ? { hashtag: h } : h,
          );
        }
        if (cancelled) return;
        setSuggestions({ kind: suggestionKind, items });
        setSuggestionsVisible(items.length > 0);
      } catch (e) {
        if (!cancelled) setSuggestionsVisible(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestionKind, suggestionKeyword]);

  // Tap a suggestion → commit it as a filter chip and drop the typed token.
  const selectSuggestion = (item: any) => {
    if (suggestionKind === "user") {
      const u = item.username;
      setAuthorFilters((prev) => (prev.includes(u) ? prev : [...prev, u]));
    } else if (suggestionKind === "community") {
      setScope(item.slug);
    } else if (suggestionKind === "tag") {
      const t = (item.hashtag || item.text || item.name || "").replace(
        /^#/,
        "",
      );
      if (t) setTagFilters((prev) => (prev.includes(t) ? prev : [...prev, t]));
    } else if (suggestionKind === "nav") {
      if (item.id === "settings") (navigation as any).navigate("Settings");
      else if (item.id === "bookmarks")
        (navigation as any).navigate("Bookmarks");
      else if (item.id === "notifications")
        (navigation as any).navigate("Notifications");
      setSuggestionsVisible(false);
      setQuery("");
      return;
    }
    const raw = trailingRaw;
    setQuery((q) => {
      const idx = q.lastIndexOf(raw);
      return idx >= 0
        ? (q.slice(0, idx) + q.slice(idx + raw.length)).trim()
        : q.trim();
    });
    setSuggestionsVisible(false);
  };

  // Content filters are active → the results ARE content. A PERSON filter
  // (@user) swaps the tab bar for the involvement tabs (All/Posts/Mentions/
  // Comments/Reposts) and opens on "All"; community/tag-only filters stay on
  // the plain Posts tab. Removing all chips restores the tab the user was on.
  const filtersActive =
    authorFilters.length > 0 || !!scope || tagFilters.length > 0 || !!source;
  const hasPersonFilter = authorFilters.length > 0;
  const prevTabBeforeFiltersRef = useRef<string | null>(null);
  const filtersWereActiveRef = useRef(false);
  useEffect(() => {
    if (filtersActive) {
      if (!filtersWereActiveRef.current) {
        prevTabBeforeFiltersRef.current = activeTab;
        filtersWereActiveRef.current = true;
      }
      // Bookmarks → the All/Posts/Events tab set; Settings → plain Posts;
      // person chips → the involvement tab set (wins over the others).
      const target = hasPersonFilter
        ? "f-all"
        : source === "bookmarks"
          ? "bm-all"
          : source === "notifications"
            ? "n-all"
            : "posts";
      if (activeTab !== target) {
        if (hasPersonFilter) {
          // Arrive on the involvement tab set unless already inside it.
          if (!String(activeTab).startsWith("f-")) setActiveTab(target);
        } else if (source === "bookmarks") {
          if (!String(activeTab).startsWith("bm-")) setActiveTab(target);
        } else if (source === "notifications") {
          if (!String(activeTab).startsWith("n-")) setActiveTab(target);
        } else if (
          String(activeTab).startsWith("f-") ||
          String(activeTab).startsWith("bm-") ||
          String(activeTab).startsWith("n-")
        ) {
          // Person/bookmark/notification chips removed (community/tag/settings still on) →
          // plain Posts tab.
          setActiveTab("posts");
        }
      }
    } else if (filtersWereActiveRef.current) {
      const prev = prevTabBeforeFiltersRef.current;
      setActiveTab(
        prev &&
          !String(prev).startsWith("f-") &&
          !String(prev).startsWith("bm-") &&
          !String(prev).startsWith("n-")
          ? prev
          : "all",
      );
      prevTabBeforeFiltersRef.current = null;
      filtersWereActiveRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersActive, hasPersonFilter, source]);

  // Hashtag taps navigate to Search with { query, tab: 'hashtags' }. When the
  // Search screen is ALREADY in the stack, navigate() pops back to the existing
  // instance instead of mounting a fresh one — its useState initializers won't
  // re-run, so sync params → state here to pick up the new query/tab. The query
  // change then flows through the normal cache-reset + fetch path below.
  useEffect(() => {
    const p = route.params as any;
    if (p?.query !== undefined) setQuery(p.query);
    if (p?.tab) setActiveTab(p.tab as string);
    if (p?.scopeCommunity !== undefined) setScope(p.scopeCommunity);
    if (p?.authorFilter !== undefined)
      setAuthorFilters(
        p.authorFilter
          ? String(p.authorFilter)
              .split(",")
              .map((s: string) => s.trim())
              .filter(Boolean)
          : [],
      );
    if (p?.source !== undefined) setSource(p.source as string);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    (route.params as any)?.query,
    (route.params as any)?.tab,
    (route.params as any)?.scopeCommunity,
    (route.params as any)?.authorFilter,
    (route.params as any)?.source,
  ]);
  // Track whether we've loaded discovery content at least once — prevents the
  // empty-state flash on the "all" tab when discovery data is already available.
  const [discoveryLoaded, setDiscoveryLoaded] = useState(false);

  // ── Per-tab results cache ──
  // Each tab keeps its own rows + pagination + scroll offset, so switching tabs
  // back and forth restores exactly where you left off instead of resetting to
  // page 1. The cache is invalidated only when the QUERY changes.
  const [rowsByTab, setRowsByTab] = useState<Partial<Record<string, Row[]>>>(
    {},
  );
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
  // Filters (author / community chips) count as part of the search identity:
  // a chip added or removed must invalidate the per-tab caches like a query
  // change does.
  const lastFiltersKeyRef = useRef("");
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
      out.push({
        isHeader: true,
        title: sectionTitle(type, isDiscovery),
        type,
      });
      if (type === "hashtags") {
        // Don't duplicate the hashtag rows inline — they live on the dedicated
        // Hashtags tab. The section is a single doorway that jumps there and
        // runs the hashtag search (see renderItem's viewAll branch).
        out.push({
          isHeader: false,
          item: { viewAll: true, itemType: "hashtags" },
          type,
        });
        return;
      }
      items.forEach((item: any) =>
        out.push({ isHeader: false, item: { ...item, itemType: type }, type }),
      );
    });
    return out;
  };

  const fetchResults = useCallback(
    async (
      q: string,
      tab: string,
      pageToLoad = 1,
      append = false,
      // Pull-to-refresh: skip the full-screen loading spinner (the RefreshControl
      // shows its own) so the list stays visible while it re-fetches.
      silent = false,
    ) => {
      const reqId = ++searchReqRef.current;
      if (!append && !silent) setLoading(true);
      try {
        if (sourceRef.current === "settings") {
          const term = q.toLowerCase();
          const filtered = SETTINGS_ITEMS.filter(s => s.title.toLowerCase().includes(term) || s.keywords.some(k => k.toLowerCase().includes(term)));
          setRowsByTab((prev) => ({
            ...prev,
            [tab]: filtered.map(item => ({ isHeader: false, item, type: "settings_item" as SearchType }))
          }));
          setLoading(false);
          return;
        }

        if (sourceRef.current === "notifications") {
          const res = await notificationService.getNotifications(1, 100);
          const term = q.toLowerCase();
          let filtered = res.data.filter(n => n.text?.toLowerCase().includes(term) || n.actor?.toLowerCase().includes(term));
          
          if (tab === "n-likes") filtered = filtered.filter(n => n.type === "like");
          else if (tab === "n-comments") filtered = filtered.filter(n => n.type === "comment");
          else if (tab === "n-follows") filtered = filtered.filter(n => n.type === "follow");

          setRowsByTab((prev) => ({
            ...prev,
            [tab]: filtered.map(item => ({ isHeader: false, item, type: "notification_item" as SearchType }))
          }));
          setLoading(false);
          return;
        }

        if (tab === "all") {
          // Discovery overview — one request with per-section previews. The "See
          // all" buttons jump to the fully paginated individual tabs.
          if (append) return;
          const res = await searchService.searchAll(
            q,
            6,
            scopeRef.current,
            authorRef.current.join(","),
            tagRef.current.join(","),
            sourceRef.current === "bookmarks" ? "1" : "",
            sourceRef.current === "settings" ? "1" : "",
            sortByRef.current,
            postFilterRef.current,
          );
          const built = buildAllRows(res, !q.trim());
          setRowsByTab((prev) => ({ ...prev, [tab]: built }));
          if (!q.trim() && built.length > 0) setDiscoveryLoaded(true);
        } else if (tab === "hashtags") {
          if (append) return;
          const hashtags = await searchService.getHashtags(q);
          setRowsByTab((prev) => ({
            ...prev,
            [tab]: hashtags.map((h) => ({
              isHeader: false,
              item: { text: h, itemType: "hashtags" },
              type: "hashtags" as SearchType,
            })),
          }));
        } else {
          // Filter-mode tabs (f-*) always search posts, narrowed by the
          // involvement dimension. Bookmarks tabs (bm-*) search saved posts
          // (bm-all/bm-posts) or saved events (bm-events). Regular tabs search
          // their own entity.
          const isFilterTab = tab.startsWith("f-");
          const isBookmarkTab = tab.startsWith("bm-");
          const isPostTab = tab.startsWith("p-");
          const searchType = isFilterTab
            ? "posts"
            : isBookmarkTab
              ? tab === "bm-events"
                ? "events"
                : "posts"
              : isPostTab
                ? "posts"
                : tab;
          const res = await searchService.searchByType(
            searchType as any,
            q,
            pageToLoad,
            10,
            undefined,
            scopeRef.current,
            authorRef.current.join(","),
            isFilterTab ? involvementOf(tab) : "",
            tagRef.current.join(","),
            sourceRef.current === "bookmarks" ? "1" : "",
            sourceRef.current === "settings" ? "1" : "",
            sortByRef.current,
            isPostTab ? postFilterRef.current : "",
          );
          // A newer request (typing / tab switch) started after this one — drop it.
          if (searchReqRef.current !== reqId) return;
          tabHasMoreRef.current[tab] = res.hasNext;
          tabPageRef.current[tab] = res.page;
          const newRows: Row[] = res.items.map((item) => ({
            isHeader: false as const,
            item,
            // searchType already maps f-*/bm-* tabs back to the entity they
            // search (posts / events) so the right row component renders.
            type: searchType as SearchType,
          }));
          setRowsByTab((prev) => {
            const existing = prev[tab] || [];
            return {
              ...prev,
              [tab]: append
                ? [
                    ...existing,
                    ...newRows.filter(
                      (row: any) =>
                        !existing.some(
                          (r: any) =>
                            !r.isHeader && r.item?.id === row.item?.id,
                        ),
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
    },
    [],
  );

  // Pull-to-refresh — re-fetch the ACTIVE tab's first page (replaces the rows
  // for that tab; other tabs keep their cached results + scroll offsets).
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchResults(effectiveQuery, activeTab, 1, false, true);
    } finally {
      setRefreshing(false);
    }
  }, [effectiveQuery, activeTab, fetchResults]);

  // Infinite scroll — appends the next page on individual tabs (posts, people,
  // communities, events, games) using that tab's own pagination refs. The
  // "all" and "hashtags" tabs are single requests.
  const loadMore = useCallback(() => {
    if (activeTab === "all" || activeTab === "hashtags") return;
    if (!tabHasMoreRef.current[activeTab] || loadingMore || loading) return;
    setLoadingMore(true);
    fetchResults(
      effectiveQuery,
      activeTab,
      (tabPageRef.current[activeTab] || 1) + 1,
      true,
    );
  }, [activeTab, loadingMore, loading, effectiveQuery, fetchResults]);

  // Switching tabs saves the outgoing tab's scroll offset so it can be
  // restored exactly on return. The QUERY is shared state, so it stays
  // pre-filled in the input on every tab; the tab-switch effect below either
  // restores the incoming tab's cached rows + scroll (already fetched for this
  // query) or fetches its first page fresh.
  const switchTab = useCallback(
    (tab: string) => {
      if (tab === activeTab) return;
      scrollOffsetsRef.current[activeTab] = scrollOffsetCurrentRef.current;
      setActiveTab(tab);
    },
    [activeTab],
  );

  // "See all" on an All-tab section header → deep-link to that section's tab
  // with the current query kept (shared state) and scroll restored by the
  // tab-switch effect. Same path as the tab bar, named for intent.
  const seeAll = useCallback((tab: SearchType) => switchTab(tab), [switchTab]);

  // Single debounced effect: on a QUERY change every tab's cache is invalidated
  // and the active tab refetches; on a TAB switch the cached rows (if any) are
  // kept and only scrolled back into place — no reset to page 1.
  useEffect(() => {
    // A filter chip added/removed changes the search identity just like the
    // text does — compare both so the caches reset and results refetch.
    const filtersKey = `${authorFilters.join(",")}|${scope || ""}|${tagFilters.join(",")}|${source || ""}|${sortBy}`;
    const queryChanged =
      lastQueryRef.current !== effectiveQuery ||
      lastFiltersKeyRef.current !== filtersKey;
    lastQueryRef.current = effectiveQuery;
    lastFiltersKeyRef.current = filtersKey;
    const handler = setTimeout(
      () => {
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
        fetchResults(effectiveQuery, activeTab);
      },
      queryChanged ? 300 : 0,
    );
    return () => clearTimeout(handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    effectiveQuery,
    activeTab,
    authorFilters,
    scope,
    tagFilters,
    sortBy,
    fetchResults,
  ]);

  // Open a games tab result inside the Games screen.
  const openGames = () => {
    (navigation as any).navigate("Main", { screen: "Games" });
  };

  const renderTab = (tab: { key: string; label: string }) => {
    const isActive = activeTab === tab.key;
    return (
      <TouchableOpacity
        style={[styles.tabBtn, isActive && styles.tabBtnActive]}
        onPress={() => {
          if (tab.key.startsWith("p-")) {
            setPostFilter(tab.key.replace("p-", ""));
          }
          switchTab(tab.key);
        }}
        activeOpacity={0.8}
      >
        <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
          {tab.label}
        </Text>
      </TouchableOpacity>
    );
  };

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
              row.isHeader ||
              row.type !== "posts" ||
              (row.item as any)?.id !== post.id
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
            toggleLike({
              id: post.id,
              isCurrentlyLiked: post.isLiked || false,
            });
            patchPost({ isLiked: !post.isLiked });
          }}
          onSave={() => {
            toggleSave({
              id: post.id,
              isCurrentlySaved: post.isSaved || false,
            });
            patchPost({ isSaved: !post.isSaved });
          }}
          onComment={(p: any) =>
            navigation.push("PostDetail", { post: p ?? post })
          }
          onShare={() => {
            const shareTitle =
              (post as any)?.title || `${post.author?.name || "User"}'s Post`;
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
            themedAlert(
              "Reported",
              "Thank you. This post has been reported for review.",
            )
          }
          showDelete={
            !!currentUser && currentUser.id === (post as any)?.author?.id
          }
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
            <Text style={styles.peopleMeta}>
              {data.follower_count || 0} followers
            </Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={16}
            color={colors.text.muted}
          />
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
            {data.community_avatar ||
            data.avatar ||
            data.avatarUrl ||
            data.avatar_url ? (
              <Image
                source={{
                  uri:
                    data.community_avatar ||
                    data.avatar ||
                    data.avatarUrl ||
                    data.avatar_url,
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
          <Ionicons
            name="chevron-forward"
            size={16}
            color={colors.text.muted}
          />
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
          onPress={() =>
            (navigation as any).navigate("Main", { screen: "Events" })
          }
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
              {data.attendee_count || 0} attending ·{" "}
              {data.event_type || "event"}
            </Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={16}
            color={colors.text.muted}
          />
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
              {[data.category, data.difficulty].filter(Boolean).join(" · ") ||
                "Play now"}
            </Text>
            <Text style={styles.peopleMeta}>
              Up to {data.maxPlayers || 2} players
            </Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={16}
            color={colors.text.muted}
          />
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
              <Ionicons
                name="pricetags-outline"
                size={15}
                color={colors.primaryLight}
              />
            </View>
            <Text style={styles.hashtagText}>Browse all hashtags</Text>
            <Ionicons
              name="chevron-forward"
              size={16}
              color={colors.text.muted}
            />
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

    if (type === ("settings_item" as any)) {
      return (
        <TouchableOpacity
          style={styles.peopleRow}
          onPress={() => {
            if (data.action === "logout") {
              // Not implementing log out directly here, navigate to settings
              (navigation as any).navigate("Settings");
            } else if (data.action === "delete") {
              (navigation as any).navigate("Settings");
            } else if (data.route) {
              (navigation as any).navigate(data.route);
            }
          }}
          activeOpacity={0.8}
        >
          <View style={[styles.avatarBubble, { backgroundColor: colors.bg.surface }]}>
            <Ionicons name={data.icon as any} size={20} color={colors.text.secondary} />
          </View>
          <View style={styles.peopleInfo}>
            <Text style={styles.peopleName}>{data.title}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.text.muted} />
        </TouchableOpacity>
      );
    }

    if (type === ("notification_item" as any)) {
      return (
        <TouchableOpacity
          style={styles.peopleRow}
          onPress={() => (navigation as any).navigate("Notifications")}
          activeOpacity={0.8}
        >
          <View style={styles.avatarBubble}>
            {data.avatarUrl ? (
              <Image source={{ uri: data.avatarUrl }} style={styles.avatarImg} />
            ) : (
              <Text style={{ fontSize: 18 }}>{data.avatar || "👾"}</Text>
            )}
          </View>
          <View style={[styles.peopleInfo, { flex: 1 }]}>
            <Text style={styles.peopleName} numberOfLines={1}>{data.actor}</Text>
            <Text style={styles.peopleHandle} numberOfLines={2}>{data.text}</Text>
          </View>
          <Text style={{ fontSize: 12, color: colors.text.muted, marginLeft: 8 }}>{data.time}</Text>
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

  const isEmptyQuery = !query.trim() && !filtersActive;
  const hasResults = rows.length > 0;
  // Friendly tab name for empty-state text (filter/bookmark tabs use prefixed
  // keys like f-* / bm-*).
  const activeTabLabel =
    FILTER_TABS.find((t) => t.key === activeTab)?.label ||
    BOOKMARK_TABS.find((t) => t.key === activeTab)?.label ||
    activeTab;

  // Show a discovery hint when there's no search query.
  // Don't show the generic "type something" empty state when we already know
  // discovery content was loaded — it briefly flashes before rows populate.
  const showSearchPrompt =
    isEmptyQuery && !hasResults && !loading && !discoveryLoaded;

  const renderEmptyStateHeader = () => (
    <View style={{ flex: 1, paddingBottom: 20 }}>
      {recentSearches.length > 0 && (
        <View style={styles.recentSearchesContainer}>
          <View style={styles.recentHeader}>
            <Text style={styles.recentTitle}>Recent Searches</Text>
            <TouchableOpacity
              onPress={async () => {
                setRecentSearches([]);
                await AsyncStorage.removeItem("@recent_searches");
              }}
            >
              <Text style={styles.recentClear}>Clear</Text>
            </TouchableOpacity>
          </View>
          {recentSearches.map((term) => (
            <TouchableOpacity
              key={term}
              style={styles.recentRow}
              onPress={() => {
                setQuery(term);
                saveRecentSearch(term);
              }}
              activeOpacity={0.7}
            >
              <Ionicons
                name="time-outline"
                size={20}
                color={colors.text.muted}
              />
              <Text style={styles.recentText}>{term}</Text>
              <TouchableOpacity
                onPress={async () => {
                  const updated = recentSearches.filter((s) => s !== term);
                  setRecentSearches(updated);
                  await AsyncStorage.setItem(
                    "@recent_searches",
                    JSON.stringify(updated),
                  );
                }}
                style={{ padding: 4 }}
              >
                <Ionicons name="close" size={16} color={colors.text.muted} />
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );

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
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flex: 1, marginHorizontal: 8 }}
            contentContainerStyle={{ alignItems: "center" }}
            keyboardShouldPersistTaps="handled"
          >
            {/* Reddit-style filter chips — @user (author) and c/community, each
                with an X to drop it. Typing "@user c/community" in the box
                produces the same chips; they combine when searching posts. */}
            {authorFilters.map((u) => (
              <TouchableOpacity
                key={u}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: colors.primaryLight + "22",
                    marginLeft: 0,
                    marginRight: 8,
                  },
                ]}
                onPress={() =>
                  setAuthorFilters((prev) => prev.filter((x) => x !== u))
                }
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    { color: colors.primaryLight },
                  ]}
                  numberOfLines={1}
                >
                  @{u}
                </Text>
                <Ionicons
                  name="close-circle"
                  size={13}
                  color={colors.primaryLight}
                />
              </TouchableOpacity>
            ))}
            {postMode ? (
              <TouchableOpacity
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: colors.primary + "22",
                    marginLeft: 0,
                    marginRight: 8,
                  },
                ]}
                onPress={() => {
                  setPostMode(false);
                  setActiveTab("all");
                }}
                activeOpacity={0.8}
              >
                <Text
                  style={[styles.filterChipText, { color: colors.primary }]}
                  numberOfLines={1}
                >
                  📝 Posts
                </Text>
                <Ionicons
                  name="close-circle"
                  size={13}
                  color={colors.primary}
                />
              </TouchableOpacity>
            ) : null}
            {gameMode ? (
              <TouchableOpacity
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: colors.warning + "22",
                    marginLeft: 0,
                    marginRight: 8,
                  },
                ]}
                onPress={() => {
                  setGameMode(false);
                  setActiveTab("all");
                }}
                activeOpacity={0.8}
              >
                <Text
                  style={[styles.filterChipText, { color: colors.warning }]}
                  numberOfLines={1}
                >
                  🎮 Games
                </Text>
                <Ionicons
                  name="close-circle"
                  size={13}
                  color={colors.warning}
                />
              </TouchableOpacity>
            ) : null}
            {scope ? (
              <TouchableOpacity
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: colors.cyanLight + "22",
                    marginLeft: 0,
                    marginRight: 8,
                  },
                ]}
                onPress={() => setScope("")}
                activeOpacity={0.8}
              >
                <Text
                  style={[styles.filterChipText, { color: colors.cyanLight }]}
                  numberOfLines={1}
                >
                  c/{scope}
                </Text>
                <Ionicons
                  name="close-circle"
                  size={13}
                  color={colors.cyanLight}
                />
              </TouchableOpacity>
            ) : null}
            {source === "bookmarks" ? (
              <TouchableOpacity
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: colors.primary + "22",
                    marginLeft: 0,
                    marginRight: 8,
                  },
                ]}
                onPress={() => setSource("")}
                activeOpacity={0.8}
              >
                <Ionicons name="bookmark" size={12} color={colors.primary} />
                <Text
                  style={[styles.filterChipText, { color: colors.primary }]}
                  numberOfLines={1}
                >
                  Bookmarks
                </Text>
                <Ionicons
                  name="close-circle"
                  size={13}
                  color={colors.primary}
                />
              </TouchableOpacity>
            ) : null}
            {source === "settings" ? (
              <TouchableOpacity
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: colors.bg.elevated,
                    marginLeft: 0,
                    marginRight: 8,
                  },
                ]}
                onPress={() => setSource("")}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="settings-outline"
                  size={12}
                  color={colors.text.secondary}
                />
                <Text
                  style={[
                    styles.filterChipText,
                    { color: colors.text.secondary },
                  ]}
                  numberOfLines={1}
                >
                  Settings
                </Text>
                <Ionicons
                  name="close-circle"
                  size={13}
                  color={colors.text.secondary}
                />
              </TouchableOpacity>
            ) : null}
            {source === "notifications" ? (
              <TouchableOpacity
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: colors.bg.elevated,
                    marginLeft: 0,
                    marginRight: 8,
                  },
                ]}
                onPress={() => setSource("")}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="notifications-outline"
                  size={12}
                  color={colors.text.secondary}
                />
                <Text
                  style={[
                    styles.filterChipText,
                    { color: colors.text.secondary },
                  ]}
                  numberOfLines={1}
                >
                  Notifications
                </Text>
                <Ionicons
                  name="close-circle"
                  size={13}
                  color={colors.text.secondary}
                />
              </TouchableOpacity>
            ) : null}
            {tagFilters.map((t) => (
              <TouchableOpacity
                key={t}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: colors.xpGold + "22",
                    marginLeft: 0,
                    marginRight: 8,
                  },
                ]}
                onPress={() =>
                  setTagFilters((prev) => prev.filter((x) => x !== t))
                }
                activeOpacity={0.8}
              >
                <Text
                  style={[styles.filterChipText, { color: colors.xpGold }]}
                  numberOfLines={1}
                >
                  #{t}
                </Text>
                <Ionicons name="close-circle" size={13} color={colors.xpGold} />
              </TouchableOpacity>
            ))}
            <TextInput
              style={[
                styles.searchInput,
                { marginLeft: 0, marginRight: 0, minWidth: 120 },
              ]}
              placeholder="Taddle the box…"
              placeholderTextColor={colors.text.muted}
              value={query}
              onChangeText={handleQueryChange}
              onSubmitEditing={handleSubmit}
              autoFocus
              returnKeyType="search"
              autoCapitalize="none"
            />
          </ScrollView>
          {(query.length > 0 ||
            authorFilters.length > 0 ||
            scope ||
            tagFilters.length > 0 ||
            source) && (
            <TouchableOpacity
              onPress={() => {
                setQuery("");
                setAuthorFilters([]);
                setScope("");
                setTagFilters([]);
                setSource("");
                setPostMode(false);
                setGameMode(false);
                setActiveTab("all");
              }}
              style={{ marginRight: 8 }}
            >
              <Ionicons
                name="close-circle"
                size={18}
                color={colors.text.muted}
              />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => setShowFilters(true)}>
            <MaterialCommunityIcons
              name="sort-variant"
              size={24}
              color={colors.text.secondary}
              style={{ transform: [{ scaleX: -1 }] }}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* @user / c/community / #tag suggestions — tap one to commit it as a chip */}
      {suggestionsVisible && suggestionKind && (
        <View style={styles.suggestionBox}>
          <Text style={styles.suggestionLabel}>
            {suggestionKind === "user"
              ? "People"
              : suggestionKind === "community"
                ? "Communities"
                : suggestionKind === "nav"
                  ? "Navigation"
                  : "Hashtags"}
          </Text>
          {suggestions.items.map((item, i) => {
            if (suggestionKind === "nav") {
              return (
                <TouchableOpacity
                  key={item.id}
                  style={styles.suggestionRow}
                  onPress={() => selectSuggestion(item)}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      styles.suggestionAvatar,
                      { backgroundColor: colors.bg.base },
                    ]}
                  >
                    <Ionicons
                      name={item.icon as any}
                      size={18}
                      color={colors.text.primary}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.suggestionName} numberOfLines={1}>
                      Navigate to {item.title}
                    </Text>
                    <Text style={styles.suggestionHandle} numberOfLines={1}>
                      ./{item.id}
                    </Text>
                  </View>
                  <Ionicons
                    name="arrow-forward"
                    size={18}
                    color={colors.text.muted}
                  />
                </TouchableOpacity>
              );
            }

            const tag = (item.hashtag || item.text || item.name || "").replace(
              /^#/,
              "",
            );
            const avatar =
              suggestionKind === "user"
                ? item.user_avatar ||
                  item.avatar ||
                  item.avatarUrl ||
                  item.avatar_url
                : suggestionKind === "community"
                  ? item.community_avatar ||
                    item.avatar ||
                    item.avatarUrl ||
                    item.avatar_url
                  : "";
            const handle =
              suggestionKind === "user"
                ? `@${item.username}`
                : suggestionKind === "community"
                  ? `c/${item.slug}`
                  : suggestionKind === "nav"
                    ? `Navigate to ${item.title}`
                    : `posts tagged #${tag}`;
            return (
              <TouchableOpacity
                key={suggestionKind === "tag" ? tag : item.id || i}
                style={styles.suggestionRow}
                onPress={() => selectSuggestion(item)}
                activeOpacity={0.7}
              >
                <View style={styles.suggestionAvatar}>
                  {avatar ? (
                    <Image
                      source={{ uri: avatar }}
                      style={styles.suggestionAvatarImg}
                    />
                  ) : suggestionKind === "user" ? (
                    <Text style={{ fontSize: 16 }}>👾</Text>
                  ) : suggestionKind === "community" ? (
                    <Ionicons
                      name="people-outline"
                      size={16}
                      color={colors.text.muted}
                    />
                  ) : suggestionKind === "nav" ? (
                    <Ionicons
                      name={item.icon as any}
                      size={16}
                      color={colors.text.muted}
                    />
                  ) : (
                    <Text
                      style={{
                        fontSize: 15,
                        fontWeight: "800",
                        color: colors.xpGold,
                      }}
                    >
                      #
                    </Text>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.suggestionName} numberOfLines={1}>
                    {suggestionKind === "tag" ? `#${tag}` : (item.name || item.title)}
                  </Text>
                  <Text style={styles.suggestionHandle} numberOfLines={1}>
                    {handle}
                  </Text>
                </View>
                {suggestionKind === "nav" ? (
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={colors.text.muted}
                  />
                ) : (
                  <Ionicons
                    name="add-circle-outline"
                    size={18}
                    color={colors.text.muted}
                  />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Tabs Row */}
      {source !== "settings" && (
        <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={
              hasPersonFilter
                ? FILTER_TABS
                : source === "bookmarks"
                  ? BOOKMARK_TABS
                  : source === "notifications"
                    ? NOTIF_TABS
                    : postMode
                      ? POST_TABS
                      : TABS
            }
            keyExtractor={(item) => item.key}
            contentContainerStyle={styles.tabsContainer}
            renderItem={({ item }) => renderTab(item)}
          />
        </View>
      )}

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
            row.isHeader
              ? `header-${row.type}-${index}`
              : `${row.type}-${row.item.id || index}`
          }
          renderItem={renderItem}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + 20 },
          ]}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />
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
            isEmptyQuery ? (
              <View>
                {renderEmptyStateHeader()}
                <View style={styles.discoverBanner}>
                  <Ionicons name="sparkles" size={18} color={colors.xpGold} />
                  <Text style={styles.discoverText}>Discoveries for You!</Text>
                </View>
              </View>
            ) : null
          }
        />
      ) : showSearchPrompt ? (
        renderEmptyStateHeader()
      ) : !isEmptyQuery ? (
        <View style={styles.centerBox}>
          <Text style={styles.emptyText}>
            No results found for "{query}" in {activeTabLabel}
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

      {/* Filter Modal */}
      <Modal
        visible={showFilters}
        transparent
        animationType="slide"
        onRequestClose={() => setShowFilters(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowFilters(false)}
        >
          <View
            style={styles.modalContent}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filters</Text>
              <TouchableOpacity
                onPress={() => setShowFilters(false)}
                style={styles.modalCloseBtn}
              >
                <Ionicons name="close" size={24} color={colors.text.primary} />
              </TouchableOpacity>
            </View>

            <View style={styles.filterGroup}>
              <Text style={styles.filterGroupTitle}>TYPE</Text>
              <View style={styles.filterRow}>
                {[
                  { id: "relevance", label: "Relevance" },
                  { id: "top", label: "Top" },
                  { id: "new", label: "New" },
                  { id: "hot", label: "Hot" },
                ].map((t) => (
                  <TouchableOpacity
                    key={t.id}
                    style={[
                      styles.sheetFilterChip,
                      filterType === t.id && styles.sheetFilterChipActive,
                    ]}
                    onPress={() => setFilterType(t.id)}
                  >
                    <Text
                      style={[
                        styles.sheetFilterChipText,
                        filterType === t.id && styles.sheetFilterChipTextActive,
                      ]}
                    >
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.filterGroup}>
              <Text style={styles.filterGroupTitle}>TIME</Text>
              <View style={styles.filterRow}>
                {[
                  { id: "recent", label: "Recent" },
                  { id: "past_week", label: "Past Week" },
                  { id: "past_month", label: "Past Month" },
                  { id: "past_year", label: "Past Year" },
                  { id: "all_time", label: "All Time" },
                ].map((t) => (
                  <TouchableOpacity
                    key={t.id}
                    style={[
                      styles.sheetFilterChip,
                      filterTime === t.id && styles.sheetFilterChipActive,
                    ]}
                    onPress={() => setFilterTime(t.id)}
                  >
                    <Text
                      style={[
                        styles.sheetFilterChipText,
                        filterTime === t.id && styles.sheetFilterChipTextActive,
                      ]}
                    >
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <TouchableOpacity
              style={styles.applyFilterBtn}
              onPress={() => setShowFilters(false)}
            >
              <Text style={styles.applyFilterText}>Apply Filters</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
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
    // Suggestion dropdown — @user / c/community autocomplete while typing.
    suggestionBox: {
      marginHorizontal: spacing.sm,
      marginTop: 4,
      backgroundColor: c.bg.surface,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: c.border,
      overflow: "hidden",
    },
    suggestionLabel: {
      fontSize: fontSizes.xs,
      fontWeight: "700",
      color: c.text.muted,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      paddingHorizontal: 14,
      paddingTop: 10,
      paddingBottom: 4,
    },
    suggestionRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    suggestionAvatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: c.bg.elevated,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    suggestionAvatarImg: { width: "100%", height: "100%" },
    suggestionName: {
      fontSize: fontSizes.sm,
      fontWeight: "700",
      color: c.text.primary,
    },
    suggestionHandle: {
      fontSize: fontSizes.xs,
      color: c.text.muted,
      marginTop: 1,
    },
    // Chip inside the search bar — @user / c/community filter chips.
    filterChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      borderRadius: radii.full,
      paddingHorizontal: 8,
      paddingVertical: 4,
      marginLeft: 8,
      maxWidth: 130,
    },
    filterChipText: {
      fontSize: fontSizes.xs,
      fontWeight: "700",
      flexShrink: 1,
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
    filterIconButton: {
      padding: spacing.md,
      justifyContent: "center",
      alignItems: "center",
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "flex-end",
    },
    modalContent: {
      backgroundColor: c.bg.base,
      borderTopLeftRadius: radii.xl,
      borderTopRightRadius: radii.xl,
      padding: spacing.lg,
      paddingBottom: 40,
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
    modalCloseBtn: {
      padding: 4,
      backgroundColor: c.bg.surface,
      borderRadius: radii.full,
    },
    filterGroup: {
      marginBottom: spacing.lg,
    },
    filterGroupTitle: {
      fontSize: fontSizes.xs,
      fontWeight: "700",
      color: c.text.muted,
      marginBottom: spacing.sm,
      letterSpacing: 0.5,
    },
    filterRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 12,
    },
    sheetFilterChip: {
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderRadius: radii.full,
      backgroundColor: c.bg.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    sheetFilterChipActive: {
      backgroundColor: c.primaryLight,
      borderColor: c.primaryLight,
    },
    sheetFilterChipText: {
      fontSize: fontSizes.sm,
      fontWeight: "600",
      color: c.text.secondary,
    },
    sheetFilterChipTextActive: {
      color: "#fff",
    },
    applyFilterBtn: {
      backgroundColor: c.primaryLight,
      borderRadius: radii.lg,
      paddingVertical: 14,
      alignItems: "center",
      marginTop: spacing.md,
    },
    applyFilterText: {
      color: "#fff",
      fontSize: fontSizes.md,
      fontWeight: "700",
    },
    recentSearchesContainer: {
      paddingTop: spacing.lg,
      paddingHorizontal: spacing.md,
    },
    recentHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 12,
    },
    recentTitle: {
      fontSize: fontSizes.sm,
      fontWeight: "700",
      color: c.text.muted,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    recentClear: {
      fontSize: fontSizes.sm,
      fontWeight: "600",
      color: c.primaryLight,
    },
    recentRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    recentText: {
      flex: 1,
      fontSize: fontSizes.md,
      color: c.text.primary,
      marginLeft: 12,
    },
  });
}
